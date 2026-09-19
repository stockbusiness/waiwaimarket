import type { NextRequest } from "next/server";

import { requireHqAdmin } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { replaceBaseRule } from "@/lib/points/settings";
import { pointRuleSaveSchema } from "@/lib/validation/point-rule";

/**
 * 基本還元ルールの変更（docs/04 9.5）。
 *
 * 本部管理者のみ。`requireHqAdmin()` が多要素認証まで見る（docs/00 8.2
 * 「ルール変更・精算確定・手動調整は多要素認証を必須とする」）。
 * 0004 の `point_rules_hq_write` も管理者だけを通すので、API と RLS の
 * 二重の認可になる。service_role は使わない。
 *
 * **上書きではなく版を積む**（docs/02 6.1）。PUT ではなく POST なのは、
 * 同じ内容を 2 回送ると版が 2 つ増えるため。冪等ではない。
 */
export async function POST(request: NextRequest) {
  try {
    // 認可を先に通す。未認証の相手に入力検証の結果を返さない
    const hq = await requireHqAdmin();

    const parsed = pointRuleSaveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await replaceBaseRule(hq.client, {
      currentId: parsed.data.currentId,
      input: parsed.data.rule,
      actorId: hq.user.id,
      actorRole: hq.role,
      ip: request.headers.get("x-forwarded-for"),
    });

    if (!result.ok) {
      // 読んだ版が既に閉じられている。画面を読み直させる
      return Response.json(
        { error: { reason: result.reason } },
        { status: result.reason === "not_found" ? 404 : 409 },
      );
    }

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "ポイントルールの保存に失敗しました");
  }
}
