import { authErrorResponse } from "@/lib/auth/errors";
import { ConfigurationError } from "@/lib/supabase/env";

/**
 * Route Handler の catch 節で使う共通の変換。
 *
 * 秘密情報を扱わない純粋な変換なので server-only にはしていない（単体テストのため）。
 *
 *   認可の失敗   → 401 / 403
 *   設定の不足   → 503（足りている・いないの区別がつくよう変数名を返す）
 *   それ以外     → 500
 *
 * どの経路でも必ずログを残す。以前は出店申請の catch だけログが無く、
 * 環境変数の不足で失敗したときに何の手がかりも残らなかった。
 */
export function apiErrorResponse(error: unknown, context: string): Response {
  const authResponse = authErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ConfigurationError) {
    console.error(`${context}: 設定エラー`, { variable: error.variableName });
    return Response.json(
      { error: { reason: "configuration", variable: error.variableName } },
      { status: 503 },
    );
  }

  console.error(context, error);
  return Response.json({ error: { reason: "internal" } }, { status: 500 });
}
