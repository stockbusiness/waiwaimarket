import "server-only";

import type { HqRole } from "@/lib/supabase/database.types";
import type { Audience } from "@/lib/supabase/audience";
import {
  createSupabaseServerClient,
  type MarketSupabaseClient,
} from "@/lib/supabase/server";

import { parseHqRole, type TenantMembership } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
};

export type AudienceSession = {
  audience: Audience;
  client: MarketSupabaseClient;
  user: SessionUser | null;
};

/**
 * 面ごとのセッションを取得する。
 * getUser() は毎回 Auth サーバーへ問い合わせて JWT を検証するため、
 * cookie の中身をそのまま信用しない。
 */
export async function getAudienceSession(
  audience: Audience,
): Promise<AudienceSession> {
  const client = await createSupabaseServerClient(audience);
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return { audience, client, user: null };
  }

  return {
    audience,
    client,
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}

/** ログイン中のユーザーが属するテナントと役割。RLS により自分の行だけが返る */
export async function getTenantMemberships(
  client: MarketSupabaseClient,
): Promise<TenantMembership[]> {
  const { data, error } = await client
    .from("tenant_members")
    .select("tenant_id, role");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    tenantId: row.tenant_id,
    role: row.role,
  }));
}

/**
 * ログイン中のユーザーの本部ロール。
 * hq_members は本人以外に開いていないため、SQL 関数 current_hq_role() で引く。
 */
export async function getHqRole(
  client: MarketSupabaseClient,
): Promise<HqRole | null> {
  const { data, error } = await client.rpc("current_hq_role");
  if (error) throw error;
  return parseHqRole(data);
}

/** 認証の強度。MFA 済みなら aal2 */
export async function getAssuranceLevel(
  client: MarketSupabaseClient,
): Promise<string | null> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return null;
  return data?.currentLevel ?? null;
}
