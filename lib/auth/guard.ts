import "server-only";

import type { HqRole } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

import { forbidden, mfaRequired, unauthenticated } from "./errors";
import {
  canActAsTenantMember,
  canActAsTenantOwner,
  isHqAdmin,
  isHqOperator,
  satisfiesHqAdminAssurance,
  type TenantMembership,
} from "./roles";
import {
  getAssuranceLevel,
  getAudienceSession,
  getHqRole,
  getTenantMemberships,
  type SessionUser,
} from "./session";

/**
 * API 側の認可。RLS だけに情報保護を任せない（docs/00 8.2、CLAUDE.md 全般ルール）。
 *
 * いずれも失敗時は AuthorizationError を投げる。Route Handler では
 * authErrorResponse() で HTTP に、画面では redirect() に変換する。
 */

export type BuyerContext = {
  audience: "buyer";
  user: SessionUser;
  client: MarketSupabaseClient;
};

export type TenantContext = {
  audience: "tenant";
  user: SessionUser;
  client: MarketSupabaseClient;
  memberships: TenantMembership[];
};

export type HqContext = {
  audience: "hq";
  user: SessionUser;
  client: MarketSupabaseClient;
  role: HqRole;
  assuranceLevel: string | null;
};

export async function requireBuyer(): Promise<BuyerContext> {
  const { user, client } = await getAudienceSession("buyer");
  if (!user) throw unauthenticated();
  return { audience: "buyer", user, client };
}

/** テナントにログインしているだけ。所属の確認はしない（出店申請前の状態を許す） */
export async function requireTenantUser(): Promise<TenantContext> {
  const { user, client } = await getAudienceSession("tenant");
  if (!user) throw unauthenticated();
  const memberships = await getTenantMemberships(client);
  return { audience: "tenant", user, client, memberships };
}

/** テナント担当者以上。自店舗の商品・受注・発送 */
export async function requireTenantMember(
  tenantId: string,
): Promise<TenantContext> {
  const context = await requireTenantUser();
  if (!canActAsTenantMember(context.memberships, tenantId)) {
    throw forbidden("このテナントを操作する権限がありません");
  }
  return context;
}

/** テナント管理者のみ。担当者管理・精算情報・事業者情報（docs/00 5.4） */
export async function requireTenantOwner(
  tenantId: string,
): Promise<TenantContext> {
  const context = await requireTenantUser();
  if (!canActAsTenantOwner(context.memberships, tenantId)) {
    throw forbidden("テナント管理者のみが行える操作です");
  }
  return context;
}

/** 本部オペレーター以上。審査・問い合わせ・注文確認 */
export async function requireHqOperator(): Promise<HqContext> {
  const { user, client } = await getAudienceSession("hq");
  if (!user) throw unauthenticated();

  const role = await getHqRole(client);
  if (!isHqOperator(role) || role === null) {
    throw forbidden("本部の権限がありません");
  }

  return {
    audience: "hq",
    user,
    client,
    role,
    assuranceLevel: await getAssuranceLevel(client),
  };
}

/**
 * 本部管理者のみ。ルール設定・精算確定・手動調整の承認。
 * 多要素認証を必須とする（docs/00 8.2）。
 */
export async function requireHqAdmin(): Promise<HqContext> {
  const context = await requireHqOperator();

  if (!isHqAdmin(context.role)) {
    throw forbidden("本部管理者のみが行える操作です");
  }
  if (!satisfiesHqAdminAssurance(context.assuranceLevel)) {
    throw mfaRequired();
  }

  return context;
}
