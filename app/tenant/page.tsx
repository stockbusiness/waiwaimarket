import { Badge } from "@/components/ui/alert";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import type { TenantStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "テナント管理" };

const STATUS_LABEL: Record<TenantStatus, string> = {
  applied: "申請済み（審査待ち）",
  under_review: "審査中",
  approved: "承認済み",
  suspended: "停止中",
  rejected: "差し戻し",
};

export default async function TenantHome() {
  const context = await withPageGuard("tenant", requireTenantUser);

  if (context.memberships.length === 0) {
    return (
      <PageShell>
        <PageHeader
          title="テナント管理"
          description="まだ出店申請が行われていません。"
          />
        <div>
          <ButtonLink href="/tenant/apply">出店を申請する</ButtonLink>
        </div>
      </PageShell>
    );
  }

  // 0004 の tenants_member_read で自分の所属テナントだけが返る
  const { data: tenants } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
    .in("id", context.memberships.map((m) => m.tenantId));

  return (
    <PageShell>
      <PageHeader
        title="テナント管理"
        description={context.user.email}
      />

      <ul className="flex flex-col gap-4">
        {(tenants ?? []).map((tenant) => {
          const membership = context.memberships.find((m) => m.tenantId === tenant.id);
          const isOwner = membership?.role === "owner";
          const stripeDone =
            tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled;

          return (
            <li key={tenant.id}>
              <Card>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium">{tenant.name}</p>
                    <Badge>{isOwner ? "管理者" : "担当者"}</Badge>
                  </div>

                  <dl className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
                    <div className="flex gap-2">
                      <dt className="text-muted">審査状態</dt>
                      <dd>{STATUS_LABEL[tenant.status]}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Stripe</dt>
                      <dd>{stripeDone ? "完了" : "未完了"}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {isOwner && !stripeDone ? (
                      <TextLink href="/tenant/onboarding">Stripe の手続きへ</TextLink>
                    ) : null}
                    <TextLink href="/tenant/products">商品</TextLink>
                    <TextLink href="/tenant/settings/shipping">送料設定</TextLink>
                    <TextLink href="/tenant/store">店舗ページ</TextLink>
                    {isOwner ? (
                      <TextLink href="/tenant/settings/legal">事業者情報</TextLink>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
