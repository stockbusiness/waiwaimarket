import type { NextRequest } from "next/server";

import { requireBuyer } from "@/lib/auth/guard";
import { MAX_ITEM_QUANTITY, removeCartItem, updateCartItem } from "@/lib/cart/cart";
import { apiErrorResponse } from "@/lib/http/errors";

/**
 * カートの行の数量変更と削除。
 *
 * 他人の行は 0004 の cart_items_self_all が弾くので 404 になる。
 * 「他人の行だ」とは返さない（存在を知らせない）。
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/market/cart/items/[itemId]">,
) {
  try {
    const buyer = await requireBuyer();
    const { itemId } = await context.params;

    const body = (await request.json()) as { quantity?: unknown };
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      return Response.json({ error: { reason: "invalid_quantity" } }, { status: 422 });
    }

    const result = await updateCartItem(buyer.client, { itemId, quantity });
    if (!result.ok) {
      const status = result.reason === "invalid_quantity" ? 422 : 404;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "数量を変更できませんでした");
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/market/cart/items/[itemId]">,
) {
  try {
    const buyer = await requireBuyer();
    const { itemId } = await context.params;

    const result = await removeCartItem(buyer.client, itemId);
    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "カートから削除できませんでした");
  }
}
