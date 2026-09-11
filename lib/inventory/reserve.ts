import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 在庫引当（docs/06 4.2、フェーズ2-3）。
 *
 * 判断はすべて 0011 の PostgreSQL 関数の中で行う。ここは呼ぶだけの薄い層に
 * とどめる。「読んで、確かめて、書く」をアプリ側に持たせると、その隙間で
 * 二重に売れる（docs/05「在庫1点の商品を同時購入しても1件だけ成立する」）。
 *
 * service_role を使う。`inventory_reservations` は RLS 有効でポリシーを
 * 置いていないため（0004）、サーバー処理からしか触れない。
 */

export type ReserveResult =
  | { ok: true; reservationId: string }
  /** 在庫不足。異常ではなく通常の結果 */
  | { ok: false; reason: "out_of_stock" };

export async function reserveInventory(params: {
  variantId: string;
  quantity: number;
  /** カートか注文のどちらかは必ず渡す（0003 の制約） */
  cartId?: string;
  orderId?: string;
}): Promise<ReserveResult> {
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc("reserve_inventory", {
    p_variant_id: params.variantId,
    p_quantity: params.quantity,
    p_cart_id: params.cartId ?? null,
    p_order_id: params.orderId ?? null,
  });

  if (error) throw error;
  return data ? { ok: true, reservationId: data } : { ok: false, reason: "out_of_stock" };
}

/**
 * 引当を解放する。既に解放済みなら false。
 *
 * カートから外す、購入手続きをやめる、決済に失敗した、といった場面で呼ぶ。
 * 二重に呼んでも在庫は二重に戻らない（0011 が `released_at is null` で絞る）。
 */
export async function releaseReservation(reservationId: string): Promise<boolean> {
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc("release_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) throw error;
  return data === true;
}

/**
 * 期限切れをまとめて解放する。解放した件数を返す。
 *
 * 冪等なので、何度実行しても結果は変わらない。
 * このバッチが遅れても売り過ぎは起きない。引当の直前に、その SKU の
 * 期限切れをその場で解放しているため（0011 の
 * `release_expired_for_variant`）。バッチは後片付けである。
 */
export async function releaseExpiredReservations(): Promise<number> {
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc("release_expired_reservations");

  if (error) throw error;
  return data ?? 0;
}
