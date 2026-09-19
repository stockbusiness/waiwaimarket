import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnOrder } from "@/lib/orders/guard";
import { transitionOrder } from "@/lib/orders/transition";
import { orderCancelSchema } from "@/lib/validation/order";

/**
 * テナント都合の取消（docs/04 9.2、docs/06 フェーズ3-6）。
 *
 * 発送前だけ。発送後は返金の扱いになる（`lib/orders/status.ts` の
 * `cancel` は `pending` と `paid` からしか進まない）。
 *
 * **理由を必須にする。** 店の都合で止める以上、購入者に伝える言葉が要る
 * （商品の差戻しと同じ判断）。購入者からの取消は任意にしてある。
 *
 * **決済済みの取消の返金はまだ行われない。** Stripe が繋がっていないため。
 * 状態だけ `cancelled` にして在庫を戻す。返金（`reverse_transfer` を含む）
 * はフェーズ3-6 で入る。それまでは決済済みの注文自体が作られない。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/orders/[id]/cancel">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnOrder(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const parsed = orderCancelSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    if (!parsed.data.note) {
      return Response.json({ error: { reason: "note_required" } }, { status: 422 });
    }

    const result = await transitionOrder(loaded.context.client, {
      orderId: id,
      from: loaded.order.status,
      action: "cancel",
      actor: "tenant",
    });

    if (!result.ok) {
      const status = result.reason === "forbidden" ? 403 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: "order.cancel",
      targetTable: "orders",
      targetId: id,
      detail: { from: loaded.order.status, note: parsed.data.note },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ status: result.status });
  } catch (error) {
    return apiErrorResponse(error, "取消に失敗しました");
  }
}
