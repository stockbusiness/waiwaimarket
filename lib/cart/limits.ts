/**
 * カートの上限。
 *
 * IO を持たないので `server-only` を付けない。数量の選択肢を出す
 * クライアント側（components/buyer/cart-items.tsx）からも使うため、
 * `lib/cart/cart.ts`（server-only）には置けない。
 */

/** 1 行の上限。打ち間違いで極端な数量が入るのを防ぐ */
export const MAX_ITEM_QUANTITY = 99;
