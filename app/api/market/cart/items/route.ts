import type { NextRequest } from "next/server";

import { requireBuyer } from "@/lib/auth/guard";
import { addToCart, MAX_ITEM_QUANTITY } from "@/lib/cart/cart";
import { apiErrorResponse } from "@/lib/http/errors";

/**
 * カートへ入れる（docs/04 9.1）。
 *
 * 経路が `/api/...` なのは、購入者面の cookie の path が `/` のため
 * （docs/04 9.0）。
 *
 * 受け取るのは SKU と数量だけ。金額もテナントも渡させない。どのテナントの
 * 商品かは SKU から引き直す（CLAUDE.md「クライアントから来た金額を信用しない」）。
 *
 * **ここでは在庫を引き当てない**（docs/06 4.2）。引当は購入手続きの開始時。
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireBuyer();

    const body = (await request.json()) as { variantId?: unknown; quantity?: unknown };
    if (typeof body.variantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      return Response.json({ error: { reason: "invalid_quantity" } }, { status: 422 });
    }

    const result = await addToCart(context.client, {
      buyerId: context.user.id,
      variantId: body.variantId,
      quantity,
    });

    if (!result.ok) {
      const status = result.reason === "invalid_quantity" ? 422 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ cartId: result.cartId });
  } catch (error) {
    return apiErrorResponse(error, "カートに追加できませんでした");
  }
}
