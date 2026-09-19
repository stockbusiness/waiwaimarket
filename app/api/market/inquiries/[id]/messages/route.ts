import type { NextRequest } from "next/server";

import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { addMessage } from "@/lib/inquiries/store";
import { inquiryMessageSchema } from "@/lib/validation/inquiry";

/**
 * 購入者からの追記（docs/04 9.1）。
 *
 * 他人のスレッドは 0014 の `inquiry_messages_buyer_insert` が弾く。
 * 読めないスレッドは `not_found` にする。「他人のものだから拒否した」と
 * 区別できる応答にすると、存在するかどうかを外から確かめられてしまう
 * （配送先と同じ扱い。docs/04 9.1）。
 *
 * 発言者は必ずセッションの利用者。body では受け取らない。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/market/inquiries/[id]/messages">,
) {
  try {
    const { id } = await context.params;
    const buyer = await requireBuyer();

    const parsed = inquiryMessageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await addMessage(buyer.client, {
      inquiryId: id,
      senderRole: "buyer",
      senderId: buyer.user.id,
      body: parsed.data.body,
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "送信できませんでした");
  }
}
