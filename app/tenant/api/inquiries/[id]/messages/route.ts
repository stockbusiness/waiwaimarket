import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnInquiry } from "@/lib/inquiries/guard";
import { addMessage } from "@/lib/inquiries/store";
import { inquiryMessageSchema } from "@/lib/validation/inquiry";

/**
 * テナントからの返信（docs/04 9.2）。
 *
 * 経路が `/tenant/api/...` なのは、テナント面の cookie の path が `/tenant`
 * のため（docs/04 9.0）。`/api/tenant/...` に置くと cookie が送られず、
 * 常に未認証になる。
 *
 * 返信すると 0014 の `inquiry_touch_thread()` が状態を「回答済み」へ移す。
 * ここからは状態を書かない。2 か所で書くと片方だけ成功したときに
 * 一覧の並びが狂う。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/inquiries/[id]/messages">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnInquiry(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const parsed = inquiryMessageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await addMessage(loaded.context.client, {
      inquiryId: id,
      senderRole: "tenant",
      senderId: loaded.context.user.id,
      body: parsed.data.body,
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    // 本文は残さない。購入者とのやり取りそのものは
    // product_inquiry_messages が追記専用で持っている
    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: "inquiry.reply",
      targetTable: "product_inquiries",
      targetId: id,
      detail: { message_id: result.id },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "返信を送信できませんでした");
  }
}
