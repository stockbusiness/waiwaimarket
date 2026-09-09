import type { TenantStatus } from "@/lib/supabase/database.types";

/**
 * 出店申請の状態遷移（docs/00 5.3、docs/01 4.3、docs/06 フェーズ1）。
 * IO を持たない判定だけを置く。実行は lib/tenants/review.ts。
 */

export const TENANT_REVIEW_ACTIONS = [
  "start_review",
  "approve",
  "reject",
  "suspend",
  "reinstate",
] as const;

export type TenantReviewAction = (typeof TENANT_REVIEW_ACTIONS)[number];

const TRANSITIONS: Record<TenantReviewAction, { from: TenantStatus[]; to: TenantStatus }> = {
  start_review: { from: ["applied", "rejected"], to: "under_review" },
  approve: { from: ["under_review"], to: "approved" },
  reject: { from: ["under_review"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "approved" },
};

export function isTenantReviewAction(value: string): value is TenantReviewAction {
  return (TENANT_REVIEW_ACTIONS as readonly string[]).includes(value);
}

export function canTransition(from: TenantStatus, action: TenantReviewAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export function nextStatus(action: TenantReviewAction): TenantStatus {
  return TRANSITIONS[action].to;
}

/** 停止と復帰は本部管理者のみ。審査そのものはオペレーターでも行える（docs/00 5.3・5.4） */
export function requiresHqAdmin(action: TenantReviewAction): boolean {
  return action === "suspend" || action === "reinstate";
}

export type ApprovalInput = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  hasLegalProfile: boolean;
};

/**
 * 承認をせき止めている理由。
 * docs/01 4.3「オンボーディング完了だけでは承認せず、本部の商品・事業者審査も
 * 通過した時点で出店可能にする」に従い、Stripe が済んでいても本部の承認操作は
 * 別に要る。ここが見るのは前提条件が揃っているかだけ。
 */
export function approvalBlockers(input: ApprovalInput): string[] {
  const blockers: string[] = [];

  if (!input.stripeAccountId) {
    blockers.push("Stripe 連結アカウントが未作成です");
  } else {
    if (!input.stripeChargesEnabled) {
      blockers.push("Stripe の決済受付が有効になっていません");
    }
    if (!input.stripePayoutsEnabled) {
      blockers.push("Stripe の出金が有効になっていません");
    }
  }

  if (!input.hasLegalProfile) {
    blockers.push("特定商取引法に基づく事業者情報が未登録です");
  }

  return blockers;
}

export function canApprove(input: ApprovalInput): boolean {
  return approvalBlockers(input).length === 0;
}
