/**
 * ポイントの期限（docs/02 6.1）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「有効期限：ロット単位の固定期限。付与日から12か月」
 * 「確定時期：発送登録日＋14日」
 *
 * 月数・日数はルールのスナップショットから渡す。ハードコードしない
 * （docs/02 6.1「管理画面から変更可能にする」）。
 */

/**
 * 付与日から N か月後。
 *
 * **存在しない日は月末へ丸める。翌月へ繰り上げない。**
 * 1/31 の 1 か月後は 2/31 で、JavaScript の `Date` に任せると 3/3 になる。
 * 期限が案内より延びると、失効バッチと購入者への表示がずれる。短い側へ
 * 倒して「表示した期限までは必ず使える」を保つ（2026-09-19 決定）。
 * うるう年の 2/29 に付与した分も、翌年は 2/28 になる。
 *
 * 計算はすべて UTC。ローカル時刻で組み立てると、実行環境のタイムゾーンで
 * 日付が 1 日ずれる。
 */
export function expiresAt(grantedAt: Date, months: number): Date {
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error(`月数は 1 以上の整数です: ${months}`);
  }

  const year = grantedAt.getUTCFullYear();
  const month = grantedAt.getUTCMonth();
  const day = grantedAt.getUTCDate();

  const shifted = month + months;
  const targetYear = year + Math.floor(shifted / 12);
  const targetMonth = ((shifted % 12) + 12) % 12;

  // 「翌月の 0 日」は当月の末日
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDay),
      grantedAt.getUTCHours(),
      grantedAt.getUTCMinutes(),
      grantedAt.getUTCSeconds(),
      grantedAt.getUTCMilliseconds(),
    ),
  );
}

/**
 * 発送登録日から N 日後。ここは日数なので月末の丸めは要らない。
 *
 * 配送完了の自動検知は MVP で実装しない（docs/06 11章）。発送登録が起点。
 */
export function confirmAt(shippedAt: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`日数は 0 以上の整数です: ${days}`);
  }
  return new Date(shippedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 期限切れか。境界（ちょうど 0 秒）は切れている扱い（在庫引当の TTL と揃える） */
export function isExpired(expiry: Date, now: Date = new Date()): boolean {
  return expiry.getTime() <= now.getTime();
}
