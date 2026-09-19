import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnInquiry } from "@/lib/inquiries/guard";
import { canCloseInquiry, canReopenInquiry } from "@/lib/inquiries/status";
import { setInquiryStatus } from "@/lib/inquiries/store";
import { inquiryActionSchema } from "@/lib/validation/inquiry";

/**
 * 問い合わせを完了にする・再開する（docs/04 9.2）。
 *
 * 閉じられるのはテナントだけ。返答の要否を判断するのは店側なので、
 * 購入者には閉じる手段を出さない（購入者が返信をやめたスレッドは
 * 未回答のまま一覧に残り、店側が気づいて閉じられる）。
 *
 * **読んだときの状態を条件に書く。** 2 人の担当者が同じスレッドを開いて
 * いると、後から押したほうが前の判断を黙って上書きしてしまう。
 * 0 件更新なら `invalid_transition` を返してやり直させる（商品審査と同じ形）。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/inquiries/[id]">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnInquiry(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const parsed = inquiryActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { action } = parsed.data;
    const from = loaded.inquiry.status;
    const allowed = action === "close" ? canCloseInquiry(from) : canReopenInquiry(from);
    if (!allowed) {
      return Response.json({ error: { reason: "invalid_transition" } }, { status: 409 });
    }

    // 再開の行き先は「未回答」。閉じる前が回答済みでも、閉じたあとに
    // 再開するのは店側が続きを要ると判断したときなので、手元に残す
    const result = await setInquiryStatus(loaded.context.client, {
      inquiryId: id,
      from,
      to: action === "close" ? "closed" : "open",
    });

    if (!result.ok) {
      return Response.json({ error: { reason: "invalid_transition" } }, { status: 409 });
    }

    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: `inquiry.${action}`,
      targetTable: "product_inquiries",
      targetId: id,
      detail: { from },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "状態を変更できませんでした");
  }
}
