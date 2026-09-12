import { redirect } from "next/navigation";

import { ShippingForm } from "@/components/tenant/shipping-form";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "送料設定" };

export default async function TenantShippingPage() {
  const context = await withPageGuard("tenant", requireTenantUser);
  const membership = context.memberships[0];
  if (!membership) redirect("/tenant");

  const { data: profile } = await context.client
    .from("shipping_profiles")
    .select("name, base_fee, free_threshold, lead_time_days")
    .eq("tenant_id", membership.tenantId)
    .maybeSingle();

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/settings/shipping", label: "送料設定" },
        ]}
      />
      <PageHeader
        title="送料設定"
        description="購入手続きで購入者に表示されます。未設定のあいだは送料無料・3 日で見積もられます。"
      />

      <ShippingForm
        tenantId={membership.tenantId}
        initial={{
          name: profile?.name ?? "標準",
          baseFee: String(profile?.base_fee ?? 0),
          freeThreshold: profile?.free_threshold == null ? "" : String(profile.free_threshold),
          leadTimeDays: String(profile?.lead_time_days ?? 3),
        }}
      />
    </PageShell>
  );
}
