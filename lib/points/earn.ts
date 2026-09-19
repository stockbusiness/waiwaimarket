import { largestRemainder } from "./allocate";
import { BASIS_POINTS } from "./rules";

/**
 * 獲得ポイントの計算（docs/02 6.1）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「購入時の獲得ポイント総数は、注文内の付与対象額合計に還元率を掛け、
 * 小数点以下を切り捨てて求める」
 *
 * **送料とポイント利用分は付与対象外。** その判定は呼び出し側が済ませ、
 * `order_items.point_eligible_amount` に入れておく。ここでは受け取った額で
 * 計算する。
 */

export type EarnLine = {
  orderItemId: string;
  /** 付与対象額（税込。送料とポイント値引きを除いたもの） */
  pointEligibleAmount: number;
};

/**
 * 注文全体の獲得ポイント。
 *
 * **明細ごとに丸めない。** 99 円の明細が 3 つあるとき、明細ごとに切り捨てると
 * 0 + 0 + 0 = 0 だが、まとめると floor(297 × 1%) = 2 になる。
 * 税の計算と同じで、ポイントも取引単位で出す。
 */
export function earnedPoints(lines: EarnLine[], rateBasisPoints: number): number {
  const eligible = lines.reduce((sum, line) => sum + line.pointEligibleAmount, 0);
  return Math.floor((eligible * rateBasisPoints) / BASIS_POINTS);
}

/**
 * 明細ごとの獲得ポイント。合計は必ず `earnedPoints()` と一致する。
 *
 * 付与は明細単位で記録する（docs/02 6.1「付与単位：注文明細（order_item）単位」）。
 * 返品のときに明細単位で取り消せるようにするため。
 */
export function allocateEarn(
  lines: EarnLine[],
  rateBasisPoints: number,
): Map<string, number> {
  return largestRemainder(
    earnedPoints(lines, rateBasisPoints),
    lines.map((line) => ({ id: line.orderItemId, weight: line.pointEligibleAmount })),
  );
}
