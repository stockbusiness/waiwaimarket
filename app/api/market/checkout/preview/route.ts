import type { NextRequest } from "next/server";

import { requireBuyer } from "@/lib/auth/guard";
import { startCheckout } from "@/lib/checkout/preview";
import { apiErrorResponse } from "@/lib/http/errors";

/**
 * 購入手続きの開始（docs/04 9.1、docs/06 4.2）。
 *
 * **ここで在庫を引き当てる**（TTL 15 分）。カート投入時には引き当てない。
 *
 * 受け取るのはカートIDと配送先IDだけ。金額も送料もクライアントから
 * 渡させない（CLAUDE.md「金額はすべてサーバー側で再計算する」）。
 *
 * **注文はまだ作らない。** 注文の作成と決済はフェーズ3 の Stripe 接続と
 * 一緒に入る。
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireBuyer();

    const body = (await request.json()) as { cartId?: unknown; addressId?: unknown };
    if (typeof body.cartId !== "string" || typeof body.addressId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const result = await startCheckout(context.client, {
      buyerId: context.user.id,
      cartId: body.cartId,
      addressId: body.addressId,
    });

    if (!result.ok) {
      // 在庫不足は異常ではなく通常の結果。409 で返して画面に出させる
      const status =
        result.reason === "out_of_stock" || result.reason === "cart_blocked" ? 409 : 404;
      return Response.json(
        { error: { reason: result.reason, variantId: result.variantId } },
        { status },
      );
    }

    return Response.json({ preview: result.preview });
  } catch (error) {
    return apiErrorResponse(error, "購入手続きを開始できませんでした");
  }
}
