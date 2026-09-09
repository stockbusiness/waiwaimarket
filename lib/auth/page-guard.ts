import "server-only";

import { redirect } from "next/navigation";

import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";

import { AuthorizationError } from "./errors";

/** 本部管理者の多要素認証の設定画面 */
export const HQ_MFA_PATH = "/admin/mfa";

/**
 * Server Component から guard を呼ぶときの包み。
 * 認可の失敗をリダイレクトに変換する。
 *   未ログイン・権限不足 → その面のログイン画面
 *   多要素認証が未了     → MFA の設定画面
 */
export async function withPageGuard<T>(
  audience: Audience,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.reason === "mfa_required") {
        redirect(HQ_MFA_PATH);
      }
      const params = new URLSearchParams({ error: error.message });
      redirect(`${AUDIENCE_CONFIG[audience].loginPath}?${params.toString()}`);
    }
    throw error;
  }
}
