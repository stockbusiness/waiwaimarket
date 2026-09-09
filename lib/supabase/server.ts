import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIENCE_CONFIG, type Audience } from "./audience";
import type { Database } from "./database.types";
import { isProduction, supabaseAnonKey, supabaseUrl } from "./env";

export type MarketSupabaseClient = SupabaseClient<Database>;

/**
 * Server Component / Route Handler / Server Action 用のクライアント。
 * anon キーを使うため、アクセス制御は RLS が効く。API 側の認可は
 * lib/auth/guard.ts で別途行う（RLS だけに依存しない：docs/00 8.2）。
 *
 * リクエストごとに必ず新しく作る。使い回すとセッションが混ざる。
 */
export async function createSupabaseServerClient(
  audience: Audience,
): Promise<MarketSupabaseClient> {
  const cookieStore = await cookies();
  const config = AUDIENCE_CONFIG[audience];

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: {
      name: config.cookieName,
      path: config.cookiePath,
      sameSite: "lax",
      secure: isProduction(),
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは cookie を書けない。
          // セッションの更新は proxy.ts が担当するため、ここは握りつぶしてよい。
        }
      },
    },
  });
}
