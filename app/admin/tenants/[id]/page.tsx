import { notFound } from "next/navigation";

import { TenantReviewActions } from "@/components/admin/tenant-review-actions";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import type { TenantStatus } from "@/lib/supabase/database.types";
import {
  approvalBlockers,
  canTransition,
  TENANT_REVIEW_ACTIONS,
  type TenantReviewAction,
} from "@/lib/tenants/status";

export const metadata = { title: "テナント詳細" };

const STATUS_LABEL: Record<TenantStatus, string> = {
  applied: "申請済み",
  under_review: "審査中",
  approved: "承認済み",
  suspended: "停止中",
  rejected: "差し戻し",
};

export default async function AdminTenantDetailPage(
  props: PageProps<"/admin/tenants/[id]">,
) {
  const context = await withPageGuard("hq", requireHqOperator);
  const { id } = await props.params;

  const { data: tenant, error } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!tenant) notFound();

  const { data: legal } = await context.client
    .from("tenant_legal_profiles")
    .select("legal_name, representative_name, address, phone, email, invoice_registration_number")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const blockers = approvalBlockers({
    stripeAccountId: tenant.stripe_account_id,
    stripeChargesEnabled: tenant.stripe_charges_enabled,
    stripePayoutsEnabled: tenant.stripe_payouts_enabled,
    hasLegalProfile: legal !== null,
  });

  const actions = TENANT_REVIEW_ACTIONS.filter((action: TenantReviewAction) =>
    canTransition(tenant.status, action),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        <p className="text-sm text-zinc-600">{STATUS_LABEL[tenant.status]}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">事業者情報</h2>
        {legal ? (
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex gap-3"><dt className="w-28 text-zinc-600">登記名称</dt><dd>{legal.legal_name}</dd></div>
            <div className="flex gap-3"><dt className="w-28 text-zinc-600">代表者</dt><dd>{legal.representative_name}</dd></div>
            <div className="flex gap-3"><dt className="w-28 text-zinc-600">所在地</dt><dd>{legal.address}</dd></div>
            <div className="flex gap-3"><dt className="w-28 text-zinc-600">電話</dt><dd>{legal.phone}</dd></div>
            <div className="flex gap-3"><dt className="w-28 text-zinc-600">メール</dt><dd>{legal.email}</dd></div>
            <div className="flex gap-3">
              <dt className="w-28 text-zinc-600">登録番号</dt>
              <dd>{legal.invoice_registration_number ?? "未登録"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-600">未登録です。</p>
        )}
      </section>

      {blockers.length > 0 ? (
        <section className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">承認できない理由</p>
          <ul className="mt-1 list-inside list-disc">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">操作</h2>
        <TenantReviewActions tenantId={tenant.id} actions={actions} />
        <p className="text-xs text-zinc-500">
          停止と停止解除は本部管理者のみが行えます（多要素認証が必要です）。
        </p>
      </section>
    </main>
  );
}
