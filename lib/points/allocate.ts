/**
 * 最大剰余方式の配分（docs/02 6.1）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「各明細には明細金額に還元率を掛けた整数部分を先に割り当て、注文全体との差を
 * 小数部分が大きい明細から1ポイントずつ配分する。同率の場合は order_item_id 順と
 * し、再計算しても同じ結果になるようにする」
 *
 * **決定性がいちばん大事。** 再計算で結果が変わると、返品のときに
 * 「何ポイント付与していたか」が合わなくなり、台帳と口座残高の照合
 * （docs/02 6.5）も通らなくなる。入力の順序に依存させない。
 *
 * **小数を使わない。** 小数部分の比較を浮動小数でやると、同じ値のはずの
 * ものが環境によって前後しうる。`total × weight` の整数をそのまま余りとして
 * 比べる（分母が共通なので大小関係は変わらない）。
 */

export type Allocatable = {
  /** 同率のときの並び順に使う。order_item_id や lot_id */
  id: string;
  /** 配分の重み。付与対象額やロットの使用数 */
  weight: number;
};

export function largestRemainder(
  total: number,
  items: Allocatable[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (items.length === 0) return result;

  const weightSum = items.reduce((sum, item) => sum + item.weight, 0);

  // 重みが無ければ配りようがない。total が残っていても 0 にする
  // （呼び出し側の誤りだが、ここで例外にすると注文全体が落ちる）
  if (weightSum <= 0 || total <= 0) {
    for (const item of items) result.set(item.id, 0);
    return result;
  }

  // 整数部を先に配る
  const shares = items.map((item) => {
    const scaled = total * item.weight;
    return {
      id: item.id,
      base: Math.floor(scaled / weightSum),
      // 余りは scaled - base × weightSum。分母が共通なので、この整数の
      // 大小がそのまま小数部分の大小になる
      remainder: scaled - Math.floor(scaled / weightSum) * weightSum,
    };
  });

  let distributed = shares.reduce((sum, share) => sum + share.base, 0);

  // 余りの大きい順、同率は id 順。**id 順が決定性の要**
  const order = [...shares].sort((a, b) =>
    b.remainder !== a.remainder ? b.remainder - a.remainder : a.id.localeCompare(b.id),
  );

  for (const share of order) {
    if (distributed >= total) break;
    share.base += 1;
    distributed += 1;
  }

  for (const share of shares) result.set(share.id, share.base);
  return result;
}
