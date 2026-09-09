import Link from "next/link";
import { redirect } from "next/navigation";

import { StripeOnboardingButton } from "@/components/tenant/stripe-onboarding-button";
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
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Stripe の手続き</h1>
        <p className="text-sm text-zinc-600">{tenant.name}</p>
      </header>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-32 text-zinc-600">決済の受付</dt>
          <dd>{chargesEnabled ? "有効" : "未完了"}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-32 text-zinc-600">出金</dt>
          <dd>{payoutsEnabled ? "有効" : "未完了"}</dd>
        </div>
        {currentlyDue.length > 0 ? (
          <div className="flex gap-3">
            <dt className="w-32 text-zinc-600">未提出の項目</dt>
            <dd>{currentlyDue.length} 件</dd>
          </div>
        ) : null}
      </dl>

      {chargesEnabled && payoutsEnabled ? (
        <p className="text-sm leading-6">
          Stripe の手続きは完了しています。本部の審査結果をお待ちください。
        </p>
      ) : (
        <StripeOnboardingButton
          tenantId={tenant.id}
          hasAccount={tenant.stripe_account_id !== null}
        />
      )}

      <Link href="/tenant" className="text-sm underline underline-offset-2">
        テナント管理へ戻る
      </Link>
    </main>
  );
}
