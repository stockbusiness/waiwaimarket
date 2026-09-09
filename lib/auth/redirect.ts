import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";

/**
 * ログイン後の遷移先を決める。
 *
 * next パラメータをそのまま使うとオープンリダイレクトになるため、
 *   - 相対パスであること（"//example.com" のような scheme 相対も弾く）
 *   - その面の path 配下であること
 * を満たすものだけ通し、それ以外は面の既定の遷移先へ落とす。
 */
export function resolveNextPath(
  audience: Audience,
  next: string | null | undefined,
): string {
  const config = AUDIENCE_CONFIG[audience];
  if (!next) return config.homePath;

  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return config.homePath;
  }
  if (next.includes("://") || next.includes("\\")) {
    return config.homePath;
  }
  // ログイン画面へ戻すと堂々巡りになる
  if (next === config.loginPath) return config.homePath;

  if (config.cookiePath === "/") return next;

  return next === config.cookiePath || next.startsWith(`${config.cookiePath}/`)
    ? next
    : config.homePath;
}
