import { BASIS_POINTS } from "./rules";

/**
 * ポイント利用（docs/02 6.1、6.3）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「注文ごとに商品代金（税込・送料除く）の50％まで。全額ポイント購入は不可」
 * 「対象ロットを期限の近い順に予約」
 */

/**
 * 利用できる上限。端数は切り捨て。
 *
 * 切り上げると、案内した「50% まで」を 1 ポイント超えることがある。
 */
export function usageCap(subtotalInclTax: number, usageCapBasisPoints: number): number {
  return Math.floor((subtotalInclTax * usageCapBasisPoints) / BASIS_POINTS);
}

export type SpendCheckResult =
  | "ok"
  | "invalid"
  /** 残高がマイナス。次回付与で相殺されるまで利用を停止する（docs/02 6.4） */
  | "negative_balance"
  | "insufficient_balance"
  | "exceeds_cap"
  /** 円決済が 0 円になる。全額ポイント購入は不可（docs/02 6.1） */
  | "no_cash_remaining";

/**
 * 利用の可否をサーバー側で判定する。
 *
 * **クライアントから来た金額を信用しない**（CLAUDE.md 絶対ルール）。
 * 小計・送料・残高はすべて呼び出し側が DB から引き直したものを渡す。
 *
 * 判定の順序は「入力として不正か → 口座が使える状態か → 足りるか →
 * 上限内か → 円が残るか」。利用者に返すときに、直すべきことが分かる
 * 理由を最初に見つける並びにしてある。
 */
export function checkSpend(params: {
  requested: number;
  /** 商品代金（税込・送料除く） */
  subtotalInclTax: number;
  shippingFee: number;
  /** 利用可能残高（予約中を除く） */
  availableBalance: number;
  usageCapBasisPoints: number;
}): SpendCheckResult {
  const { requested, subtotalInclTax, shippingFee, availableBalance } = params;

  if (!Number.isInteger(requested) || requested < 0) return "invalid";

  // 0 ポイント＝「使わない」。残高がマイナスでも購入自体は止めない
  if (requested === 0) return "ok";

  if (availableBalance < 0) return "negative_balance";
  if (requested > availableBalance) return "insufficient_balance";
  if (requested > usageCap(subtotalInclTax, params.usageCapBasisPoints)) return "exceeds_cap";

  // 上限 50% があるので通常は起きないが、上限を 100% に変えると
  // 全額ポイント購入が成立してしまう。決済アダプターに特殊経路を
  // 持たせないため、円決済は必ず 1 円以上にする（0003 の制約と揃える）
  if (subtotalInclTax + shippingFee - requested < 1) return "no_cash_remaining";

  return "ok";
}

export type ConsumableLot = {
  id: string;
  remainingPoints: number;
  /** ISO 8601。比較は文字列のままでよい（UTC で桁が揃っているため） */
  expiresAt: string;
};

export type LotConsumption = { lotId: string; points: number };

/**
 * 期限の近いロットから必要数を取る（FIFO、docs/02 6.1）。
 *
 * **足りなければ null。部分的に取らない。** 3 ロットのうち 2 つだけ押さえて
 * 「残高不足です」と返すと、その分が他の購入で使えなくなる（在庫引当で
 * 同じ判断をしている）。
 *
 * 期限が同じロットは id 順。再計算しても同じ結果になるようにする。
 */
export function consumeFifo(
  lots: ConsumableLot[],
  points: number,
): LotConsumption[] | null {
  if (!Number.isInteger(points) || points < 0) return null;
  if (points === 0) return [];

  const usable = lots
    .filter((lot) => lot.remainingPoints > 0)
    .sort((a, b) =>
      a.expiresAt !== b.expiresAt
        ? a.expiresAt.localeCompare(b.expiresAt)
        : a.id.localeCompare(b.id),
    );

  const taken: LotConsumption[] = [];
  let remaining = points;

  for (const lot of usable) {
    if (remaining === 0) break;
    const take = Math.min(lot.remainingPoints, remaining);
    taken.push({ lotId: lot.id, points: take });
    remaining -= take;
  }

  return remaining === 0 ? taken : null;
}
