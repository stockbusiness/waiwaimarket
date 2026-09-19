import { z } from "zod";

/**
 * 注文の入力（docs/04 9.1・9.2）。
 *
 * **金額も送料もクライアントから受け取らない。** 受け取るのはカートIDと
 * 配送先IDだけで、中身はサーバーが引き直す（CLAUDE.md 全般
 * 「金額・ポイント・送料・税はすべてサーバー側で再計算する」）。
 */

export const orderCreateSchema = z.object({
  cartId: z.uuid(),
  addressId: z.uuid(),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/**
 * 発送登録（docs/04 9.2 `POST /tenant/api/orders/{id}/ship`）。
 *
 * 追跡番号は任意。ネコポスや定形外など追跡の無い方法もあるため、
 * 必須にすると発送登録そのものができなくなる。
 */
export const orderShipSchema = z.object({
  carrier: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
  trackingNumber: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type OrderShipInput = z.infer<typeof orderShipSchema>;

/**
 * 取消（購入者の申請、テナントの実行）。
 *
 * 理由を必須にするのはテナント側だけ。店の都合で止める以上、購入者に
 * 伝える言葉が要る（商品の差戻しと同じ判断）。購入者からの申請は
 * 任意にする。理由を書かせること自体が引き止めに見える。
 */
export const orderCancelSchema = z.object({
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type OrderCancelInput = z.infer<typeof orderCancelSchema>;
