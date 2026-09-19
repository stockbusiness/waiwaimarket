import "server-only";

import { getAddress } from "@/lib/addresses/store";
import { toSnapshot } from "@/lib/addresses/address";
import { listCarts } from "@/lib/cart/cart";
import { calculateOrderAmounts, type MoneyLine } from "@/lib/orders/money";
import type { Json } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { generateOrderNumber } from "./number";

/**
 * 注文の作成（docs/04 9.1 `POST /api/market/orders`、docs/06 フェーズ3-4）。
 *
 * **決済はまだ繋がっていない。** 注文は `pending` で作られ、`paid` へは
 * Stripe の通知でしか進まない。確保が切れたまま残った注文は 0015 の
 * `expire_pending_orders()` が取消にする。
 *
 * **書き込みは service_role で行う。** 0015 に insert のポリシーを置いて
 * いない。金額を決めるのはサーバーであって購入者ではなく、購入者の
 * セッションから書ける形にすると、ポリシーの書き方ひとつで金額の改ざん
 * 経路になる。読み取り（カート・住所）は購入者のクライアントで行い、
 * RLS に他人のものを弾かせる。
 */

/** 一意制約の違反。注文番号の衝突で起きる */
const UNIQUE_VIOLATION = "23505";

/** 注文番号が衝突したときの引き直し回数。8.9 億分の 1 なので 1 回で足りる */
const NUMBER_RETRIES = 3;

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | {
      ok: false;
      reason:
        | "cart_not_found"
        | "address_not_found"
        | "cart_blocked"
        /** 引当が切れていた。もう一度購入手続きからやり直す */
        | "reservation_expired";
    };

/**
 * カートを注文にする。
 *
 * 流れは次のとおり。
 *
 *   1. カートと住所を購入者のクライアントで読む（RLS が他人のものを弾く）
 *   2. **金額を引き直す。** 購入手続きのプレビューで出した値を使い回さない
 *      （CLAUDE.md「クライアントから来た金額を信用しない」。プレビューの
 *      値はサーバーが出したものだが、画面を経由して戻ってくる以上は
 *      クライアント由来と同じ扱いにする）
 *   3. 注文と明細を作る。商品名・単価はその時点の値を**写し取る**
 *   4. カートに紐づく引当を注文へ付け替える
 *   5. カートを空にする
 *
 * **4 で付け替えられた件数が明細数と合わなければ、注文を取り消す。**
 * 購入手続きを始めてから確定するまでに 15 分を超えると、引当は切れて
 * 在庫が戻っている。そのまま注文を成立させると、在庫を確保していない
 * 注文ができる。
 */
export async function createOrder(
  client: MarketSupabaseClient,
  params: { buyerId: string; cartId: string; addressId: string },
): Promise<CreateOrderResult> {
  const carts = await listCarts(client, params.buyerId);
  const cart = carts.find((row) => row.cartId === params.cartId);
  if (!cart || cart.lines.length === 0) return { ok: false, reason: "cart_not_found" };

  const address = await getAddress(client, params.addressId);
  if (!address) return { ok: false, reason: "address_not_found" };

  // 買えない行が残っているカートは進ませない。合計が請求額とずれる
  if (cart.blockers.length > 0) return { ok: false, reason: "cart_blocked" };

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

  const service = createSupabaseServiceClient();

  const order = await insertOrder(service, {
    buyerId: params.buyerId,
    tenantId: cart.tenantId,
    amounts,
    shippingAddress: toSnapshot({
      recipientName: address.recipientName,
      phone: address.phone,
      postalCode: address.postalCode,
      prefectureCode: address.prefectureCode,
      city: address.city,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
    }),
  });

  // 明細。**注文時点の名称と単価を写し取る。** 商品が後から改名されても、
  // 「何を買ったか」が変わってはいけない（配送先の写し取りと同じ判断）
  const { error: itemsError } = await service.from("order_items").insert(
    cart.lines.map((line) => ({
      order_id: order.id,
      variant_id: line.variantId,
      product_title: line.optionLabel
        ? `${line.productTitle}（${line.optionLabel}）`
        : line.productTitle,
      unit_price_incl_tax: line.unitPriceInclTax,
      quantity: line.quantity,
      line_total_incl_tax: line.unitPriceInclTax * line.quantity,
      // 送料とポイント利用分は付与対象外（docs/02 6.1）。
      // ポイント利用はまだ繋がっていないので、いまは明細額がそのまま対象額
      point_eligible_amount: line.unitPriceInclTax * line.quantity,
    })),
  );

  if (itemsError) {
    await service.from("orders").delete().eq("id", order.id);
    throw itemsError;
  }

  // 引当を注文へ移す。0015 の 1 文の UPDATE で決める
  const { data: attached, error: attachError } = await service.rpc(
    "attach_reservations_to_order",
    { p_cart_id: cart.cartId, p_order_id: order.id },
  );

  if (attachError) {
    await service.from("orders").delete().eq("id", order.id);
    throw attachError;
  }

  if ((attached ?? 0) < cart.lines.length) {
    // 15 分を超えて確定した。切れた分の在庫はもう戻っている。
    //
    // **付け替わった分を先に解放する。** 一部だけ有効だった場合、注文行を
    // 消すだけだと、その引当が宙に浮いて TTL まで在庫を掴んだままになる
    await service.rpc("release_order_reservations", { p_order_id: order.id });

    // 取り消しではなく削除にする。購入者から見れば注文は成立しておらず、
    // 一覧に取消済みの行が増えるだけになる（order_items は cascade で消える）
    await service.from("orders").delete().eq("id", order.id);
    return { ok: false, reason: "reservation_expired" };
  }

  // カートを空にする。注文に写し終えているので、残すと二重に買える
  // ように見える。明細は cascade で消える（0001）
  await service.from("carts").delete().eq("id", cart.cartId);

  return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * 注文行を作る。注文番号が衝突したら引き直す。
 *
 * 一意制約（0001 の `order_number ... unique`）が最後の砦。
 * 「衝突しない前提」で制約を外さないこと。
 */
async function insertOrder(
  service: ServiceClient,
  params: {
    buyerId: string;
    tenantId: string;
    amounts: { subtotalInclTax: number; shippingFee: number; totalCharged: number };
    shippingAddress: Json;
  },
): Promise<{ id: string; orderNumber: string }> {
  for (let attempt = 0; attempt < NUMBER_RETRIES; attempt += 1) {
    const orderNumber = generateOrderNumber();

    const { data, error } = await service
      .from("orders")
      .insert({
        order_number: orderNumber,
        buyer_id: params.buyerId,
        tenant_id: params.tenantId,
        subtotal_incl_tax: params.amounts.subtotalInclTax,
        shipping_fee: params.amounts.shippingFee,
        // ポイント利用はフェーズ4 で繋ぐ。いまは必ず 0。
        //
        // `point_rule_snapshot` も既定の `{}` のまま。付与も利用も
        // 行っていないので保存すべきルールが無い。**フェーズ4 で注文に
        // ポイントを繋ぐときは、ここで注文時点の還元率・期限・負担者を
        // 書き込むこと**（CLAUDE.md「注文時点の還元率・期限・負担者・
        // 計算結果を保存する。ルール変更を既存注文に遡及適用しない」）
        point_discount: 0,
        total_charged: params.amounts.totalCharged,
        shipping_address: params.shippingAddress,
        placed_at: new Date().toISOString(),
      })
      .select("id, order_number")
      .single();

    if (!error) return { id: data.id, orderNumber: data.order_number };
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }

  throw new Error("注文番号を採番できませんでした");
}
