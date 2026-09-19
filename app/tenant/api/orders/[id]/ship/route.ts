import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnOrder } from "@/lib/orders/guard";
import { transitionOrder } from "@/lib/orders/transition";
import { orderShipSchema } from "@/lib/validation/order";

/**
 * 発送登録（docs/04 9.2、docs/06 フェーズ3-5）。
 *
 * 経路が `/tenant/api/...` なのは、テナント面の cookie の path が `/tenant`
 * のため（docs/04 9.0）。`/api/tenant/...` に置くと cookie が送られず、
 * 常に未認証になる。
 *
 * 状態（`paid` → `shipped`）と `shipments` の記録は 0015 の `ship_order`
 * がまとめて書く。**アプリから 2 回に分けない。** 片方だけ成功すると
 * 「発送済みなのに記録が無い」注文ができ、`shipped_at` を起点にする
 * ポイント確定（発送登録日＋14日、docs/02 6.1）が出せなくなる。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/orders/[id]/ship">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnOrder(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const parsed = orderShipSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await transitionOrder(loaded.context.client, {
      orderId: id,
      from: loaded.order.status,
      action: "ship",
      actor: "tenant",
      shipment: parsed.data,
    });

    if (!result.ok) {
      const status = result.reason === "forbidden" ? 403 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    // 追跡番号は個人の所在に近い情報なので、監査ログには残さない。
    // 記録そのものは shipments にある
    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: "order.ship",
      targetTable: "orders",
      targetId: id,
      detail: { has_tracking: parsed.data.trackingNumber !== undefined },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ status: result.status });
  } catch (error) {
    return apiErrorResponse(error, "発送登録に失敗しました");
  }
}
