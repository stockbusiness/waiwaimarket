import "server-only";

import { toSnapshot, type ShippingAddressSnapshot } from "@/lib/addresses/address";
import { getAddress } from "@/lib/addresses/store";
import { listCarts, type CartView } from "@/lib/cart/cart";
import { earliestExpiry, releaseReservation, reserveInventory } from "@/lib/inventory/reserve";
import { calculateOrderAmounts, type MoneyLine, type OrderAmounts } from "@/lib/orders/money";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 購入手続きの開始（docs/04 9.1 `POST /api/market/checkout/preview`、
 * docs/06 4.2）。
 *
 * ここで初めて在庫を引き当てる（TTL 15 分）。カート投入時には引き当てない。
 *
 * **届け先が決まって初めて送料が確定する。** カートでは地域別送料の下限を
 * 「800円〜」と出しているだけで、金額はここで決まる。
 *
 * **注文はまだ作らない。** 注文の作成と決済はフェーズ3 の Stripe 接続と
 * 一緒に入る。ここは「この内容で買う」の直前まで。
 */

export type CheckoutPreview = {
  cartId: string;
  tenantId: string;
  storeName: string | null;
  lines: CartView["lines"];
  amounts: OrderAmounts;
  shippingAddress: ShippingAddressSnapshot;
  /** 解放するときに使う。注文を作るところまで持ち回す */
  reservationIds: string[];
  /**
   * 引当の有効期限。**DB が入れた値をそのまま返す**（0003 の既定値）。
   * アプリ側で `now + 15 分` と計算しない（lib/inventory/ttl.ts 参照）。
   */
  expiresAt: string | null;
};

export type CheckoutPreviewResult =
  | { ok: true; preview: CheckoutPreview }
  | {
      ok: false;
      reason: "cart_not_found" | "address_not_found" | "cart_blocked" | "out_of_stock";
      /** 在庫不足のときだけ。どの行が取れなかったか */
      variantId?: string;
    };

/**
 * 引当は全部取れるか、1 つも取らないかにする。
 *
 * 3 行のうち 2 行だけ引き当てた状態で「在庫不足です」と返すと、その 2 行は
 * 15 分間ほかの人が買えないまま残る。途中で失敗したら、それまでに取った分を
 * その場で解放する。
 */
async function reserveAll(
  cartId: string,
  lines: Array<{ variantId: string; quantity: number }>,
): Promise<{ ok: true; ids: string[] } | { ok: false; variantId: string }> {
  const ids: string[] = [];

  for (const line of lines) {
    const result = await reserveInventory({
      variantId: line.variantId,
      quantity: line.quantity,
      cartId,
    });

    if (!result.ok) {
      await Promise.all(ids.map((id) => releaseReservation(id)));
      return { ok: false, variantId: line.variantId };
    }
    ids.push(result.reservationId);
  }

  return { ok: true, ids };
}

export async function startCheckout(
  client: MarketSupabaseClient,
  params: { buyerId: string; cartId: string; addressId: string },
): Promise<CheckoutPreviewResult> {
  // RLS が他人のカート・住所を弾く。読めなければ存在しないものとして扱う
  const carts = await listCarts(client, params.buyerId);
  const cart = carts.find((row) => row.cartId === params.cartId);
  if (!cart) return { ok: false, reason: "cart_not_found" };

  const address = await getAddress(client, params.addressId);
  if (!address) return { ok: false, reason: "address_not_found" };

  // 買えない行が残っているカートは進ませない。合計が請求額とずれる
  if (cart.blockers.length > 0) return { ok: false, reason: "cart_blocked" };
  if (cart.lines.length === 0) return { ok: false, reason: "cart_not_found" };

  const reserved = await reserveAll(
    cart.cartId,
    cart.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
  );
  if (!reserved.ok) {
    return { ok: false, reason: "out_of_stock", variantId: reserved.variantId };
  }

  // 金額はここで引き直す。カートの表示に使った値を使い回さない
  // （CLAUDE.md「金額はすべてサーバー側で再計算する」）
  const moneyLines: MoneyLine[] = cart.lines.map((line) => ({
    unitPriceInclTax: line.unitPriceInclTax,
    quantity: line.quantity,
    taxRate: line.taxRate,
  }));

  const amounts = calculateOrderAmounts({
    lines: moneyLines,
    shipping: {
      baseFee: cart.shipping.baseFee,
      freeThreshold: cart.shipping.freeThreshold,
      regionRules: cart.shipping.regionRules,
    },
    prefectureCode: address.prefectureCode,
  });

  // 注文へ写すのは住所そのものだけ。id と isDefault は buyer_addresses 側の
  // 都合で、注文には要らない
  const snapshot = toSnapshot({
    recipientName: address.recipientName,
    phone: address.phone,
    postalCode: address.postalCode,
    prefectureCode: address.prefectureCode,
    city: address.city,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
  });

  return {
    ok: true,
    preview: {
      cartId: cart.cartId,
      tenantId: cart.tenantId,
      storeName: cart.storeName,
      lines: cart.lines,
      amounts,
      shippingAddress: snapshot,
      reservationIds: reserved.ids,
      expiresAt: await earliestExpiry(reserved.ids),
    },
  };
}
