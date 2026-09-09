"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIENCE_CONFIG, type Audience } from "./audience";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * ブラウザ用クライアント。cookie 名と path をサーバー側と揃えることで、
 * PKCE の code verifier が各面の scope に収まり、同じ面のコールバックから
 * 読み出せるようになる。
 */
export function createSupabaseBrowserClient(
  audience: Audience,
): SupabaseClient<Database> {
  const config = AUDIENCE_CONFIG[audience];

  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: {
      name: config.cookieName,
      path: config.cookiePath,
      sameSite: "lax",
      secure: window.location.protocol === "https:",
    },
  });
}
