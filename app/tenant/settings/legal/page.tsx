import { redirect } from "next/navigation";

import { LegalProfileForm } from "@/components/tenant/legal-profile-form";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "事業者情報" };

export default async function TenantLegalPage() {
  const context = await withPageGuard("tenant", requireTenantUser);

  // 事業者情報はテナント管理者のみ（docs/00 5.4）
  const owned = context.memberships.find((m) => m.role === "owner");
  if (!owned) redirect("/tenant");

  const { data: legal } = await context.client
    .from("tenant_legal_profiles")
    .select(
      "legal_name, representative_name, address, phone, email, invoice_registration_number, return_policy",
    )
    .eq("tenant_id", owned.tenantId)
    .maybeSingle();

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/settings/legal", label: "事業者情報" },
        ]}
      />
      <PageHeader
        title="事業者情報"
        description="特定商取引法に基づく表記として、承認後は店舗ページに掲示されます。編集できるのはテナント管理者のみです。"
      />

      <LegalProfileForm
        tenantId={owned.tenantId}
        initial={{
          legalName: legal?.legal_name ?? "",
          representativeName: legal?.representative_name ?? "",
          address: legal?.address ?? "",
          phone: legal?.phone ?? "",
          email: legal?.email ?? "",
          invoiceRegistrationNumber: legal?.invoice_registration_number ?? "",
          returnPolicy: legal?.return_policy ?? "",
        }}
      />

    </PageShell>
  );
}
