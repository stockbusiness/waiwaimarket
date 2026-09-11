import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import type { TenantStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "テナント審査" };

const STATUS_LABEL: Record<TenantStatus, string> = {
  applied: "申請済み",
  under_review: "審査中",
  approved: "承認済み",
  suspended: "停止中",
  rejected: "差し戻し",
};

export default async function AdminTenantsPage() {
  const context = await withPageGuard("hq", requireHqOperator);

  // 本部は 0002 の hq_read_tenants で全件を読める。service_role は使わない。
  const { data: tenants, error } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_charges_enabled, stripe_payouts_enabled, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <PageShell width="wide">
      <PageHeader title="テナント審査" description={`${tenants?.length ?? 0} 件`} />

      {tenants && tenants.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/admin/tenants/${tenant.id}`}>
                      <span className="font-medium">{tenant.name}</span>
                    </TextLink>
                    <Badge>{STATUS_LABEL[tenant.status]}</Badge>
                  </div>
                  <p className="text-muted">
                    Stripe：
                    {tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled
                      ? "完了"
                      : "未完了"}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">まだ申請がありません。</p>
      )}
    </PageShell>
  );
}
