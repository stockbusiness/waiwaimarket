import { notFound } from "next/navigation";

import { TenantReviewActions } from "@/components/admin/tenant-review-actions";
import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Card, PageHeader, PageShell } from "@/components/ui/page";
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
    <PageShell>
      <PageHeader
        title={tenant.name}
        description={<Badge>{STATUS_LABEL[tenant.status]}</Badge>}
        actions={<TextLink href="/admin/tenants">一覧へ戻る</TextLink>}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">事業者情報</h2>
        <Card>
          {legal ? (
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="登記名称">{legal.legal_name}</Row>
              <Row label="代表者">{legal.representative_name}</Row>
              <Row label="所在地">{legal.address}</Row>
              <Row label="電話">{legal.phone}</Row>
              <Row label="メール">{legal.email}</Row>
              <Row label="登録番号">
                {legal.invoice_registration_number ?? "未登録"}
              </Row>
            </dl>
          ) : (
            <p className="text-sm text-muted">未登録です。</p>
          )}
        </Card>
      </section>

      {blockers.length > 0 ? (
        <Alert tone="warning">
          承認できない理由があります。
          <ul className="mt-1 list-inside list-disc">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">操作</h2>
        <TenantReviewActions tenantId={tenant.id} actions={actions} />
        <p className="text-xs leading-5 text-subtle">
          停止と停止解除は本部管理者のみが行えます（多要素認証が必要です）。
        </p>
      </section>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-muted sm:w-28">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
