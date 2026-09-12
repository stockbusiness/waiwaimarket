import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireTenantMember } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { shippingProfileSchema } from "@/lib/validation/shipping";

/**
 * 送料と発送日数の設定（docs/00 5.2「送料、発送日数の登録」）。
 *
 * 1 テナント 1 件なので upsert。0004 の shipping_profiles_tenant_write が
 * 効くため anon クライアントで書ける。
 *
 * 地域別送料（region_rules）はここでは扱わない。jsonb の構造が docs で
 * 未定義のため、形を決めてから入れる。
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const context = await requireTenantMember(body.tenantId);

    const parsed = shippingProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { data: existing, error: existingError } = await context.client
      .from("shipping_profiles")
      .select("id")
      .eq("tenant_id", body.tenantId)
      .maybeSingle();

    if (existingError) throw existingError;

    const values = {
      name: parsed.data.name,
      base_fee: parsed.data.baseFee,
      free_threshold: parsed.data.freeThreshold ?? null,
      lead_time_days: parsed.data.leadTimeDays,
    };

    const { error } = existing
      ? await context.client.from("shipping_profiles").update(values).eq("id", existing.id)
      : await context.client
          .from("shipping_profiles")
          .insert({ tenant_id: body.tenantId, ...values });

    if (error) throw error;

    await recordAudit({
      actorId: context.user.id,
      actorRole: "tenant_member",
      action: "shipping.update",
      targetTable: "shipping_profiles",
      targetId: body.tenantId,
      detail: {
        base_fee: parsed.data.baseFee,
        free_threshold: parsed.data.freeThreshold ?? null,
        lead_time_days: parsed.data.leadTimeDays,
      },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "送料の保存に失敗しました");
  }
}
