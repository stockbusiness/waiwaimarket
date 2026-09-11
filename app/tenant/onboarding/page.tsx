import { redirect } from "next/navigation";

import { StripeOnboardingButton } from "@/components/tenant/stripe-onboarding-button";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchAccountStatus } from "@/lib/payments/connect";

export const metadata = { title: "Stripe の手続き" };

/**
 * Stripe のオンボーディングから戻ってきたときの着地点。
 * Webhook（account.updated）とは別に、ここでも取り直して反映する。
 * Webhook が遅れても画面が古いままにならないようにするため。
 */
export default async function TenantOnboardingPage() {
  const context = await withPageGuard("tenant", requireTenantUser);
  const owned = context.memberships.find((m) => m.role === "owner");
  if (!owned) redirect("/tenant");

  // 読み取りは RLS 経由。書き込みだけ service_role を使う
  const { data: tenant } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("id", owned.tenantId)
    .maybeSingle();

  if (!tenant) redirect("/tenant");

  let chargesEnabled = tenant.stripe_charges_enabled;
  let payoutsEnabled = tenant.stripe_payouts_enabled;
  let currentlyDue: string[] = [];

  if (tenant.stripe_account_id) {
    try {
      const status = await fetchAccountStatus(tenant.stripe_account_id);
      chargesEnabled = status.chargesEnabled;
      payoutsEnabled = status.payoutsEnabled;
      currentlyDue = status.currentlyDue;

      if (
        status.chargesEnabled !== tenant.stripe_charges_enabled ||
        status.payoutsEnabled !== tenant.stripe_payouts_enabled
      ) {
        await createSupabaseServiceClient()
          .from("tenants")
          .update({
            stripe_charges_enabled: status.chargesEnabled,
            stripe_payouts_enabled: status.payoutsEnabled,
          })
          .eq("id", tenant.id);
      }
    } catch (error) {
      console.error("Stripe アカウントの取得に失敗しました", error);
    }
  }

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/onboarding", label: "Stripe の手続き" },
        ]}
      />
      <PageHeader title="Stripe の手続き" description={tenant.name} />

      <Card>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">決済の受付</dt>
            <dd className="font-medium">{chargesEnabled ? "有効" : "未完了"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">出金</dt>
            <dd className="font-medium">{payoutsEnabled ? "有効" : "未完了"}</dd>
          </div>
          {currentlyDue.length > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">未提出の項目</dt>
              <dd className="font-medium">{currentlyDue.length} 件</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {chargesEnabled && payoutsEnabled ? (
        <Alert tone="success">
          Stripe の手続きは完了しています。本部の審査結果をお待ちください。
        </Alert>
      ) : (
        <StripeOnboardingButton
          tenantId={tenant.id}
          hasAccount={tenant.stripe_account_id !== null}
        />
      )}

    </PageShell>
  );
}
