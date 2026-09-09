import "server-only";

import { recordAudit } from "@/lib/audit/log";
import type { HqRole, TenantStatus } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  approvalBlockers,
  canTransition,
  nextStatus,
  type TenantReviewAction,
} from "./status";

/**
 * テナントの審査・承認・停止（docs/00 5.3、docs/01 4.3）。
 * 状態遷移の判定は lib/tenants/status.ts（IO なし）に置き、ここは実行に徹する。
 */

export type ReviewResult =
  | { ok: true; status: TenantStatus }
  | { ok: false; reason: "not_found" | "invalid_transition" | "blocked"; blockers?: string[] };

export async function reviewTenant(params: {
  tenantId: string;
  action: TenantReviewAction;
  actorId: string;
  actorRole: HqRole;
  reason?: string;
  ip: string | null;
}): Promise<ReviewResult> {
  const service = createSupabaseServiceClient();

  const { data: tenant, error } = await service
    .from("tenants")
    .select(
      "id, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled",
    )
    .eq("id", params.tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!tenant) return { ok: false, reason: "not_found" };

  if (!canTransition(tenant.status, params.action)) {
    return { ok: false, reason: "invalid_transition" };
  }

  if (params.action === "approve") {
    const { count } = await service
      .from("tenant_legal_profiles")
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id);

    const blockers = approvalBlockers({
      stripeAccountId: tenant.stripe_account_id,
      stripeChargesEnabled: tenant.stripe_charges_enabled,
      stripePayoutsEnabled: tenant.stripe_payouts_enabled,
      hasLegalProfile: (count ?? 0) > 0,
    });

    if (blockers.length > 0) {
      return { ok: false, reason: "blocked", blockers };
    }
  }

  const status = nextStatus(params.action);
  const { error: updateError } = await service
    .from("tenants")
    .update({ status })
    .eq("id", tenant.id);

  if (updateError) throw updateError;

  await recordAudit({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: `tenant.${params.action}`,
    targetTable: "tenants",
    targetId: tenant.id,
    detail: {
      from: tenant.status,
      to: status,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    ip: params.ip,
  });

  return { ok: true, status };
}
