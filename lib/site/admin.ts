import "server-only";

import { recordAudit } from "@/lib/audit/log";
import type { HqRole } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SitePageInput } from "@/lib/validation/site-page";

/**
 * サイト共通ページの本部側の読み書き（docs/00 5.3）。
 *
 * service_role を使わない。0009 のポリシーで本部管理者の書き込みを許して
 * あるので、利用者のセッションのまま書ける。RLS と API の二重の認可
 * （docs/00 8.2）が両方効いた状態になる。service_role で書くと RLS 側が
 * 素通りになり、ポリシーの誤りに気づけなくなる。
 */

export type AdminPageSummary = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: string;
};

export type AdminRevision = {
  id: string;
  revisionNumber: number;
  body: string;
  note: string | null;
  createdAt: string;
  isPublished: boolean;
};

export type AdminPageDetail = AdminPageSummary & {
  publishedRevisionId: string | null;
  revisions: AdminRevision[];
};

export type SaveResult =
  | { ok: true; id: string; revisionNumber: number }
  | { ok: false; reason: "not_found" | "slug_taken" | "conflict" };

/** 一意制約の違反。同じ slug、または版番号の競合 */
const UNIQUE_VIOLATION = "23505";

export async function listSitePages(): Promise<AdminPageSummary[]> {
  const supabase = await createSupabaseServerClient("hq");
  const { data, error } = await supabase
    .from("site_pages")
    .select("id, slug, title, sort_order, is_published, updated_at")
    .order("sort_order")
    .order("slug");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  }));
}

export async function getSitePage(id: string): Promise<AdminPageDetail | null> {
  const supabase = await createSupabaseServerClient("hq");

  const { data: page, error } = await supabase
    .from("site_pages")
    .select("id, slug, title, sort_order, is_published, published_revision_id, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!page) return null;

  const { data: revisions, error: revisionError } = await supabase
    .from("site_page_revisions")
    .select("id, revision_number, body, note, created_at")
    .eq("page_id", id)
    .order("revision_number", { ascending: false });

  if (revisionError) throw revisionError;

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    sortOrder: page.sort_order,
    isPublished: page.is_published,
    publishedRevisionId: page.published_revision_id,
    updatedAt: page.updated_at,
    revisions: (revisions ?? []).map((row) => ({
      id: row.id,
      revisionNumber: row.revision_number,
      body: row.body,
      note: row.note,
      createdAt: row.created_at,
      isPublished: row.id === page.published_revision_id,
    })),
  };
}

export async function createSitePage(params: {
  input: SitePageInput;
  actorId: string;
  actorRole: HqRole;
  ip: string | null;
}): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient("hq");

  const { data: page, error } = await supabase
    .from("site_pages")
    .insert({
      slug: params.input.slug,
      title: params.input.title,
      sort_order: params.input.sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "slug_taken" };
    throw error;
  }

  return saveRevision({ ...params, pageId: page.id, action: "site_page.create" });
}

export async function updateSitePage(params: {
  pageId: string;
  input: SitePageInput;
  actorId: string;
  actorRole: HqRole;
  ip: string | null;
}): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient("hq");

  const { data: page, error } = await supabase
    .from("site_pages")
    .update({
      slug: params.input.slug,
      title: params.input.title,
      sort_order: params.input.sortOrder,
    })
    .eq("id", params.pageId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "slug_taken" };
    throw error;
  }
  // RLS で弾かれた場合も 0 件になる。権限は API 側の requireHqAdmin が見ている
  if (!page) return { ok: false, reason: "not_found" };

  return saveRevision({ ...params, action: "site_page.update" });
}

/**
 * 版を 1 つ積み、公開が指示されていれば公開版として指す。
 *
 * 3 つの文に分かれており、途中で失敗すると「積んだが公開していない版」が
 * 残る。これは下書きが 1 つ増えるだけで、公開中の内容は変わらない。
 * 逆順（先に公開してから本文を入れる）にすると、失敗したときに
 * 公開ページが壊れるため、この順を崩さないこと。
 */
async function saveRevision(params: {
  pageId: string;
  input: SitePageInput;
  actorId: string;
  actorRole: HqRole;
  ip: string | null;
  action: string;
}): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient("hq");

  const { data: latest, error: latestError } = await supabase
    .from("site_page_revisions")
    .select("revision_number")
    .eq("page_id", params.pageId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;
  const revisionNumber = (latest?.revision_number ?? 0) + 1;

  const { data: revision, error: revisionError } = await supabase
    .from("site_page_revisions")
    .insert({
      page_id: params.pageId,
      revision_number: revisionNumber,
      body: params.input.body,
      note: params.input.note ?? null,
      created_by: params.actorId,
    })
    .select("id")
    .single();

  if (revisionError) {
    // 他の担当者が同時に保存すると版番号がぶつかる。上書きせず、やり直させる
    if (revisionError.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
    throw revisionError;
  }

  if (params.input.publish) {
    const { error: publishError } = await supabase
      .from("site_pages")
      .update({ published_revision_id: revision.id, is_published: true })
      .eq("id", params.pageId);
    if (publishError) throw publishError;
  }

  await recordAudit({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    targetTable: "site_pages",
    targetId: params.pageId,
    detail: {
      slug: params.input.slug,
      revision_number: revisionNumber,
      published: params.input.publish,
    },
    ip: params.ip,
  });

  return { ok: true, id: params.pageId, revisionNumber };
}

/**
 * 公開を取り下げる。版は残したまま is_published を落とす。
 * published_revision_id も外す。残したままだと「非公開なのに公開版がある」
 * という読み取りにくい状態になり、公開中の版の削除も止まったままになる。
 */
export async function unpublishSitePage(params: {
  pageId: string;
  actorId: string;
  actorRole: HqRole;
  ip: string | null;
}): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient("hq");

  const { data, error } = await supabase
    .from("site_pages")
    .update({ is_published: false, published_revision_id: null })
    .eq("id", params.pageId)
    .select("id, slug")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  await recordAudit({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "site_page.unpublish",
    targetTable: "site_pages",
    targetId: params.pageId,
    detail: { slug: data.slug },
    ip: params.ip,
  });

  return { ok: true, id: params.pageId, revisionNumber: 0 };
}
