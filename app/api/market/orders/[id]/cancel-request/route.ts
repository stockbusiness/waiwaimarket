import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { canRequestCancel } from "@/lib/orders/status";
import { getOrder } from "@/lib/orders/store";
import { transitionOrder } from "@/lib/orders/transition";
import { orderCancelSchema } from "@/lib/validation/order";

/**
 * 購入者からの取消（docs/04 9.1 `cancel-request`）。
 *
 * **決済前（`pending`）は、その場で取り消す。** まだお金が動いていないので
 * テナントの承諾を待つ理由が無く、待たせるあいだ在庫が押さえられたままに
 * なる。`lib/orders/status.ts` の `cancel` は購入者にも許してある。
 *
 * **決済後（`paid`）は申請にとどめる。** 発送の準備が始まっている可能性が
 * あり、返金も伴う。テナントが判断する。
 *
 * 申請の受け皿（`cancel_requests` 等のテーブル）は docs/03 に無く、
 * 返金の設計はフェーズ3-6 で入る。いまは監査ログに残し、テナントの
 * 画面に出すのは返金と一緒に作る。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/market/orders/[id]/cancel-request">,
) {
  try {
    const { id } = await context.params;
    const buyer = await requireBuyer();

    // RLS（orders_buyer_read）が他人の注文を弾く。読めなければ 404
    const order = await getOrder(buyer.client, id);
    if (!order) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    if (!canRequestCancel(order.status)) {
      return Response.json({ error: { reason: "invalid_transition" } }, { status: 409 });
    }

    const parsed = orderCancelSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    // 決済前だけ、その場で取り消す
    if (order.status === "pending") {
      const result = await transitionOrder(buyer.client, {
        orderId: id,
        from: order.status,
        action: "cancel",
        actor: "buyer",
      });

      if (!result.ok) {
        return Response.json({ error: { reason: result.reason } }, { status: 409 });
      }

      await recordAudit({
        actorId: buyer.user.id,
        actorRole: "buyer",
        action: "order.cancel",
        targetTable: "orders",
        targetId: id,
        detail: { from: order.status, note: parsed.data.note ?? null },
        ip: request.headers.get("x-forwarded-for"),
      });

      return Response.json({ status: result.status, cancelled: true });
    }

    await recordAudit({
      actorId: buyer.user.id,
      actorRole: "buyer",
      action: "order.cancel_request",
      targetTable: "orders",
      targetId: id,
      detail: { from: order.status, note: parsed.data.note ?? null },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ status: order.status, cancelled: false });
  } catch (error) {
    return apiErrorResponse(error, "取消を受け付けられませんでした");
  }
}
