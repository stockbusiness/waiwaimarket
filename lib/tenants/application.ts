import "server-only";

import { recordAudit } from "@/lib/audit/log";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { TenantApplicationInput } from "@/lib/validation/tenant";

/**
 * 出店申請（docs/06 フェーズ1-3）。
 *
 * service_role を使うのは、新規テナントの作成が RLS で表現できないため。
 * tenants への INSERT ポリシーを開くと誰でもテナントを作れてしまい、
 * tenant_members の INSERT は is_tenant_owner() を要求するので、
 * まだ所属の無い申請者は自分を登録できない（鶏と卵）。
 * 呼び出し側で必ず requireTenantUser() を通すこと。
 */

export type ApplicationResult =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "already_belongs_to_tenant" | "failed" };

export async function submitTenantApplication(params: {
  userId: string;
  input: TenantApplicationInput;
  ip: string | null;
}): Promise<ApplicationResult> {
  const service = createSupabaseServiceClient();

  // 1 人が複数テナントを申請できないようにする。
  // 既存テナントへの担当者追加は別の導線で行う。
  const { data: existing, error: existingError } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", params.userId)
    .limit(1);

  if (existingError) throw existingError;
  if (existing && existing.length > 0) {
    return { ok: false, reason: "already_belongs_to_tenant" };
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({ name: params.input.name, status: "applied" })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    console.error("テナントの作成に失敗しました", tenantError);
    return { ok: false, reason: "failed" };
  }

  const { error: memberError } = await service
    .from("tenant_members")
    .insert({ tenant_id: tenant.id, user_id: params.userId, role: "owner" });

  const { error: legalError } = await service
    .from("tenant_legal_profiles")
    .insert({
      tenant_id: tenant.id,
      legal_name: params.input.legalName,
      representative_name: params.input.representativeName,
      address: params.input.address,
      phone: params.input.phone,
      email: params.input.email,
      invoice_registration_number: params.input.invoiceRegistrationNumber ?? null,
      return_policy: params.input.returnPolicy ?? null,
    });

  if (memberError || legalError) {
    // 途中で落ちた行は残さない。tenant_members / tenant_legal_profiles は
    // tenants への on delete cascade が張ってある。
    console.error("出店申請の登録に失敗しました", { memberError, legalError });
    await service.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, reason: "failed" };
  }

  await recordAudit({
    actorId: params.userId,
    actorRole: "tenant_owner",
    action: "tenant.apply",
    targetTable: "tenants",
    targetId: tenant.id,
    detail: { name: params.input.name },
    ip: params.ip,
  });

  return { ok: true, tenantId: tenant.id };
}
