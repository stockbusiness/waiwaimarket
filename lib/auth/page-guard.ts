import "server-only";

import { redirect } from "next/navigation";

import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";

import { AuthorizationError } from "./errors";

/**
 * Server Component から guard を呼ぶときの包み。
 * 認可の失敗をログイン画面へのリダイレクトに変換する。
 */
export async function withPageGuard<T>(
  audience: Audience,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      const params = new URLSearchParams({ error: error.message });
      redirect(`${AUDIENCE_CONFIG[audience].loginPath}?${params.toString()}`);
    }
    throw error;
  }
}
