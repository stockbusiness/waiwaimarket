/**
 * 在庫引当の有効期限（docs/06 4.2、CLAUDE.md「在庫引当・ポイント予約の TTL は 15 分」）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * **この値は表示と説明にだけ使う。** 実際の `expires_at` は 0003 の既定値
 * （`now() + interval '15 minutes'`）が入れる。両方で計算すると、
 * 片方だけ直したときに画面の案内と実際の期限がずれる。
 */
export const RESERVATION_TTL_MINUTES = 15;

export const RESERVATION_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

/** 期限が切れているか。境界（ちょうど 0 秒）は切れている扱い（DB の `<=` と揃える） */
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** 残り時間（ミリ秒）。切れていれば 0 */
export function remainingMs(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * 「あと 12 分」。購入手続きの残り時間の案内に使う。
 *
 * 秒は切り上げる。「あと 0 分」と出してからまだ 50 秒使える、という
 * 食い違いを避けるため。
 */
export function formatRemaining(expiresAt: Date, now: Date = new Date()): string {
  const ms = remainingMs(expiresAt, now);
  if (ms === 0) return "期限切れ";
  return `あと ${Math.ceil(ms / 60_000)} 分`;
}
