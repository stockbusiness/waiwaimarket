import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { required, supabaseUrl } from "./env";
import { assertServiceRoleKey } from "./service-key";

/**
 * service_role クライアント。RLS を迂回するため、使い所を限定する（docs/00 8.2）。
 *
 * このファイルは "server-only" を import しているので、Client Component から
 * 辿られるとビルドが失敗する。サービスロールキーがクライアントバンドルへ
 * 混入しないことを、規約ではなく仕組みで担保している。
 *
 * 使ってよいのは次に限る。
 *   - 監査ログの追記（audit_logs には INSERT ポリシーを置いていない）
 *   - Webhook 受信記録
 *   - バッチ処理
 *   - 本部権限の付与など、RLS では表現しきれない管理操作
 * 通常の読み書きは createSupabaseServerClient を使うこと。
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> {
  // 形式を検証してから使う。Publishable キーを取り違えて設定すると Supabase 側では
  // 認証が通ってしまい、RLS を迂回したい INSERT だけが 42501 で落ちる。
  const serviceRoleKey = assertServiceRoleKey(
    "SUPABASE_SERVICE_ROLE_KEY",
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  return createClient<Database>(supabaseUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
