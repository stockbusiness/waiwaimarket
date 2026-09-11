/**
 * Vercel Cron からの呼び出しの照合。
 *
 * IO も環境変数の読み取りも持たないので `server-only` を付けない
 * （単体テストのため）。環境変数を読む側は Route Handler に置く。
 *
 * Vercel Cron は `Authorization: Bearer <CRON_SECRET>` を付けて呼ぶ。
 * この経路は認証されたセッションを持たないため、秘密鍵の一致だけが
 * 入口の守りになる。
 */

/**
 * 長さの違いも含めて、比較にかかる時間を入力に依存させない。
 *
 * 素朴な `===` は最初に違う文字で打ち切るため、応答時間の差から
 * 1 文字ずつ突き止められる。総当たりの試行回数が桁違いに減る。
 */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    // 範囲外は 0 になる。長さが違う時点で diff は 0 にならない
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export type CronAuthResult = "ok" | "unauthorized" | "not_configured";

/**
 * `Authorization` ヘッダと設定値を突き合わせる。
 *
 * 秘密鍵が未設定なら `not_configured`。これを `ok` に倒すと、環境変数を
 * 入れ忘れた本番でバッチの経路が誰にでも開いてしまう。
 */
export function checkCronAuth(
  authorizationHeader: string | null,
  secret: string | undefined,
): CronAuthResult {
  if (!secret || secret.trim() === "") return "not_configured";
  if (!authorizationHeader) return "unauthorized";

  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return "unauthorized";

  const token = authorizationHeader.slice(prefix.length);
  return timingSafeEqual(token, secret.trim()) ? "ok" : "unauthorized";
}
