import { redirect } from "next/navigation";

import { TenantApplicationForm } from "@/components/tenant/application-form";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "出店申請" };

export default async function TenantApplyPage() {
  const context = await withPageGuard("tenant", requireTenantUser);

  // すでに所属があるなら申請済み
  if (context.memberships.length > 0) redirect("/tenant");

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/apply", label: "出店申請" },
        ]}
      />
      <PageHeader
        title="出店申請"
        description="事業者情報を登録すると審査に進みます。審査の通過に加えて Stripe の手続きの完了が出店の条件です。"
      />
      <TenantApplicationForm />
    </PageShell>
  );
}
