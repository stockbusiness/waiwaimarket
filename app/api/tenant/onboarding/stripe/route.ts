import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { authErrorResponse } from "@/lib/auth/errors";
import { requireTenantOwner } from "@/lib/auth/guard";
import { createConnectedAccount, createOnboardingLink } from "@/lib/payments/connect";
import { siteUrl } from "@/lib/supabase/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Stripe Connect オンボーディングリンクの発行（docs/04、docs/06 フェーズ1-4）。
 * 連結アカウントが未作成なら先に作る。作成済みならリンクだけ再発行する
 * （AccountLink は短命なので、中断からの再開でも同じ経路を使う）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }
    const tenantId = body.tenantId;

    const context = await requireTenantOwner(tenantId);
    const service = createSupabaseServiceClient();

    const { data: tenant, error } = await service
      .from("tenants")
      .select("id, name, stripe_account_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!tenant) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    let stripeAccountId = tenant.stripe_account_id;

    if (!stripeAccountId) {
      const account = await createConnectedAccount({
        tenantId: tenant.id,
        email: context.user.email ?? "",
        businessName: tenant.name,
      });
      stripeAccountId = account.id;

      const { error: updateError } = await service
        .from("tenants")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", tenant.id);
      if (updateError) throw updateError;

      await recordAudit({
        actorId: context.user.id,
        actorRole: "tenant_owner",
        action: "tenant.stripe_account.create",
        targetTable: "tenants",
        targetId: tenant.id,
        detail: { stripe_account_id: stripeAccountId },
        ip: request.headers.get("x-forwarded-for"),
      });
    }

    const link = await createOnboardingLink({
      stripeAccountId,
      refreshUrl: `${siteUrl()}/tenant/onboarding?state=refresh`,
      returnUrl: `${siteUrl()}/tenant/onboarding?state=return`,
    });

    return Response.json({ url: link.url });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Stripe オンボーディングの開始に失敗しました", error);
    return Response.json({ error: { reason: "internal" } }, { status: 500 });
  }
}
