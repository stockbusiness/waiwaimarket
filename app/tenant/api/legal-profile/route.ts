import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { requireTenantOwner } from "@/lib/auth/guard";
import { legalProfileSchema } from "@/lib/validation/tenant";

/**
 * 事業者情報（特商法表記）の更新。
 * テナント管理者のみ。担当者は編集できない（docs/00 5.4）。
 * RLS 側も 0002 の legal_owner_all が is_tenant_owner を要求する。
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const parsed = legalProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const context = await requireTenantOwner(body.tenantId);

    const { error } = await context.client
      .from("tenant_legal_profiles")
      .update({
        legal_name: parsed.data.legalName,
        representative_name: parsed.data.representativeName,
        address: parsed.data.address,
        phone: parsed.data.phone,
        email: parsed.data.email,
        invoice_registration_number: parsed.data.invoiceRegistrationNumber ?? null,
        return_policy: parsed.data.returnPolicy ?? null,
      })
      .eq("tenant_id", body.tenantId);

    if (error) throw error;

    await recordAudit({
      actorId: context.user.id,
      actorRole: "tenant_owner",
      action: "tenant.legal_profile.update",
      targetTable: "tenant_legal_profiles",
      targetId: body.tenantId,
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "事業者情報の保存に失敗しました");
  }
}
