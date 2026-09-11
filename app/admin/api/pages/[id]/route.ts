import type { NextRequest } from "next/server";

import { requireHqAdmin } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { unpublishSitePage, updateSitePage, type SaveResult } from "@/lib/site/admin";
import { sitePageSchema, sitePageUnpublishSchema } from "@/lib/validation/site-page";

/**
 * サイト共通ページの保存と公開の取り下げ（docs/04 9.4）。
 *
 *   PUT  … 本文の保存。必ず新しい版として積む。publish が真なら同時に公開する
 *   POST … 公開の取り下げ（本文は残る）
 *
 * 保存が PUT で取り下げが POST なのは、前者が「この内容にする」という
 * 冪等な指示、後者が状態を 1 段動かす操作だから。
 */

function toResponse(result: SaveResult): Response {
  if (result.ok) {
    return Response.json({ id: result.id, revisionNumber: result.revisionNumber });
  }
  // slug_taken も conflict も衝突なので 409
  const status = result.reason === "not_found" ? 404 : 409;
  return Response.json({ error: { reason: result.reason } }, { status });
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/admin/api/pages/[id]">,
) {
  try {
    // 認可を先に通す。未認証の相手に入力検証の結果を返さない
    const hq = await requireHqAdmin();

    const parsed = sitePageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { id } = await context.params;

    return toResponse(
      await updateSitePage({
        pageId: id,
        input: parsed.data,
        actorId: hq.user.id,
        actorRole: hq.role,
        ip: request.headers.get("x-forwarded-for"),
      }),
    );
  } catch (error) {
    return apiErrorResponse(error, "ページの保存に失敗しました");
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/admin/api/pages/[id]">,
) {
  try {
    const hq = await requireHqAdmin();

    const parsed = sitePageUnpublishSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const { id } = await context.params;

    return toResponse(
      await unpublishSitePage({
        pageId: id,
        actorId: hq.user.id,
        actorRole: hq.role,
        ip: request.headers.get("x-forwarded-for"),
      }),
    );
  } catch (error) {
    return apiErrorResponse(error, "ページの公開取り下げに失敗しました");
  }
}
