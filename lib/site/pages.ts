import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * サイト共通ページ（利用規約・プライバシーポリシー・特商法表記・会社概要など）の
 * 読み取り。公開側だけを扱う。
 *
 * anon キーのクライアントを使うため、RLS がそのまま効く。
 * 未公開のページや過去の版はここからは取れない（0009 のポリシー）。
 * service_role を使わないのは、公開判定を 2 か所に持たないため。
 */

export type PublishedPageSummary = {
  slug: string;
  title: string;
};

export type PublishedPage = PublishedPageSummary & {
  body: string;
  /** 現在の版が作られた日時。改定日として表示する */
  revisedAt: string;
};

/** フッターなどに並べる公開ページの一覧 */
export async function listPublishedPages(): Promise<PublishedPageSummary[]> {
  const supabase = await createSupabaseServerClient("buyer");
  const { data, error } = await supabase
    .from("site_pages")
    .select("slug, title")
    .eq("is_published", true)
    .order("sort_order")
    .order("slug");

  if (error) {
    // フッターのために画面全体を落とさない。リンクが減るだけにする
    console.error("公開ページの一覧を取得できませんでした", error);
    return [];
  }
  return data ?? [];
}

/** 1 ページ分。未公開・存在しない場合は null */
export async function getPublishedPage(slug: string): Promise<PublishedPage | null> {
  const supabase = await createSupabaseServerClient("buyer");

  const { data: page, error: pageError } = await supabase
    .from("site_pages")
    .select("slug, title, published_revision_id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (pageError) throw pageError;
  if (!page?.published_revision_id) return null;

  // 版は別に引く。埋め込みで取ると、RLS が版を隠したときに
  // 「ページはあるが本文が空」という分かりにくい結果になる
  const { data: revision, error: revisionError } = await supabase
    .from("site_page_revisions")
    .select("body, created_at")
    .eq("id", page.published_revision_id)
    .maybeSingle();

  if (revisionError) throw revisionError;
  if (!revision) return null;

  return {
    slug: page.slug,
    title: page.title,
    body: revision.body,
    revisedAt: revision.created_at,
  };
}
