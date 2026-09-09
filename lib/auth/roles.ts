import type { HqRole, TenantMemberRole } from "@/lib/supabase/database.types";

/**
 * 役割の判定。docs/00 5.4 の権限表に対応する。
 *
 * ここは IO を持たない純粋な判定だけを置く。DB アクセスは guard.ts が担当する。
 */

export type TenantMembership = {
  tenantId: string;
  role: TenantMemberRole;
};

/** 本部オペレーターの範囲：審査・問い合わせ・注文確認 */
export function isHqOperator(role: HqRole | null): boolean {
  return role === "hq_admin" || role === "hq_operator";
}

/** 本部管理者の範囲：全機能、ルール設定、精算確定、手動調整の承認 */
export function isHqAdmin(role: HqRole | null): boolean {
  return role === "hq_admin";
}

export function parseHqRole(value: string | null | undefined): HqRole | null {
  return value === "hq_admin" || value === "hq_operator" ? value : null;
}

export function findMembership(
  memberships: readonly TenantMembership[],
  tenantId: string,
): TenantMembership | null {
  return memberships.find((m) => m.tenantId === tenantId) ?? null;
}

/** テナント担当者でも可。自店舗の商品・受注・発送 */
export function canActAsTenantMember(
  memberships: readonly TenantMembership[],
  tenantId: string,
): boolean {
  return findMembership(memberships, tenantId) !== null;
}

/** テナント管理者のみ。担当者管理・精算情報・事業者情報 */
export function canActAsTenantOwner(
  memberships: readonly TenantMembership[],
  tenantId: string,
): boolean {
  return findMembership(memberships, tenantId)?.role === "owner";
}

/**
 * 本部管理者には多要素認証を必須とする（docs/00 8.2）。
 * Supabase は認証の強度を AAL で表し、MFA 済みは aal2 になる。
 */
export function satisfiesHqAdminAssurance(assuranceLevel: string | null): boolean {
  return assuranceLevel === "aal2";
}
