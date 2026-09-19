import { largestRemainder } from "./allocate";

/**
 * 返品・返金時の再計算（docs/02 6.4）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「注文に使用したポイントは、point_usage_allocations に保存した明細別・
 * ロット別の使用数を基に返還する。**割合計算だけで推定しない。** 数量の一部を
 * 返品する場合は、対象数量の比率を基に整数計算し、端数は同じ最大剰余方式で
 * 決定する」
 */

export type UsedAllocation = {
  lotId: string;
  /** この明細でこのロットから使ったポイント数 */
  points: number;
};

function assertQuantities(refundedQuantity: number, orderedQuantity: number): void {
  if (!Number.isInteger(orderedQuantity) || orderedQuantity <= 0) {
    throw new Error(`注文数量が不正です: ${orderedQuantity}`);
  }
  if (
    !Number.isInteger(refundedQuantity) ||
    refundedQuantity < 0 ||
    refundedQuantity > orderedQuantity
  ) {
    throw new Error(`返品数量が不正です: ${refundedQuantity} / ${orderedQuantity}`);
  }
}

/**
 * 返還するポイントをロットごとに出す。
 *
 * 返還総数は「この明細で使った合計 × 返品数量 ÷ 注文数量」の切り捨て。
 * ロットへの配分は最大剰余方式なので、合計は必ず返還総数に一致する。
 *
 * **全数量を返品したら使った分がそのまま戻る。** 端数の計算を挟んで
 * 1 ポイント減る、ということが起きない（`refundedQuantity ===
 * orderedQuantity` のとき比は 1 になる）。
 *
 * 部分返品を繰り返す場合、呼び出し側は**返した分を差し引いた残り**を
 * 次の `allocations` と `orderedQuantity` に渡すこと。元の値を渡し続けると
 * 使った分を超えて返すことになる。
 */
export function refundUsedPoints(
  allocations: UsedAllocation[],
  refundedQuantity: number,
  orderedQuantity: number,
): Map<string, number> {
  assertQuantities(refundedQuantity, orderedQuantity);

  const usedTotal = allocations.reduce((sum, entry) => sum + entry.points, 0);
  const refundTotal = Math.floor((usedTotal * refundedQuantity) / orderedQuantity);

  return largestRemainder(
    refundTotal,
    allocations.map((entry) => ({ id: entry.lotId, weight: entry.points })),
  );
}

/**
 * 取り消す付与ポイント数（docs/02 6.4）。
 *
 * 「購入で付与予定だったポイントは、返金対象明細に対応する earn_reversal を
 * 記録する」
 *
 * 利用分と同じく、数量の比率で整数計算して切り捨てる。部分返品を繰り返す
 * 場合は、取り消した分を差し引いた残りを次の `grantedPoints` に渡すこと。
 */
export function refundEarned(
  grantedPoints: number,
  refundedQuantity: number,
  orderedQuantity: number,
): number {
  assertQuantities(refundedQuantity, orderedQuantity);
  if (!Number.isInteger(grantedPoints) || grantedPoints < 0) {
    throw new Error(`付与ポイント数が不正です: ${grantedPoints}`);
  }

  return Math.floor((grantedPoints * refundedQuantity) / orderedQuantity);
}
