import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { createOrder } from "@/lib/orders/create";
import { orderCreateSchema } from "@/lib/validation/order";

/**
 * 注文の確定（docs/04 9.1、docs/06 フェーズ3-4）。
 *
 * 受け取るのはカートIDと配送先IDだけ。金額も送料もクライアントから
 * 渡させず、サーバーで引き直す（CLAUDE.md「金額はすべてサーバー側で
 * 再計算する」）。購入手続きのプレビューで出した値も使い回さない。
 *
 * **決済はまだ繋がっていない。** 注文は `pending` で作られ、`paid` へは
 * Stripe の通知でしか進まない。確保が切れたまま残った注文は
 * 0015 の `expire_pending_orders()` が取消にする。
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireBuyer();

    const parsed = orderCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await createOrder(context.client, {
      buyerId: context.user.id,
      cartId: parsed.data.cartId,
      addressId: parsed.data.addressId,
    });

    if (!result.ok) {
      // 引当切れとカートの不備は異常ではなく通常の結果。409 で返して
      // 画面に「やり直してください」と出させる
      const status =
        result.reason === "reservation_expired" || result.reason === "cart_blocked"
          ? 409
          : 404;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    await recordAudit({
      actorId: context.user.id,
      actorRole: "buyer",
      action: "order.create",
      targetTable: "orders",
      targetId: result.orderId,
      detail: { order_number: result.orderNumber },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ orderId: result.orderId, orderNumber: result.orderNumber });
  } catch (error) {
    return apiErrorResponse(error, "注文を確定できませんでした");
  }
}
