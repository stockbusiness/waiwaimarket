import type { NextRequest } from "next/server";

import { requireHqAdmin } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { createSitePage } from "@/lib/site/admin";
import { sitePageSchema } from "@/lib/validation/site-page";

/**
 * サイト共通ページの新規作成（docs/00 5.3、docs/04 9.4）。
 *
 * 経路が `/admin/api/...` なのは、本部のセッション cookie の path が
 * `/admin` のため。`/api/admin/...` に置くと cookie が送られず、
 * 認証が一度も行われないまま 401 になる（CLAUDE.md 参照）。
 *
 * 公開文書の編集は本部管理者のみ。requireHqAdmin は AAL2 を要求する。
 */
export async function POST(request: NextRequest) {
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

    const result = await createSitePage({
      input: parsed.data,
      actorId: hq.user.id,
      actorRole: hq.role,
      ip: request.headers.get("x-forwarded-for"),
    });

    if (!result.ok) {
      return Response.json(
        { error: { reason: result.reason } },
        { status: result.reason === "slug_taken" ? 409 : 400 },
      );
    }

    return Response.json({ id: result.id, revisionNumber: result.revisionNumber });
  } catch (error) {
    return apiErrorResponse(error, "ページの作成に失敗しました");
  }
}
