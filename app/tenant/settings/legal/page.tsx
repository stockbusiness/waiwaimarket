import Link from "next/link";
import { redirect } from "next/navigation";

import { LegalProfileForm } from "@/components/tenant/legal-profile-form";
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
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">事業者情報</h1>
        <p className="text-sm leading-6 text-zinc-600">
          特定商取引法に基づく表記として、承認後は店舗ページに掲示されます。
          編集できるのはテナント管理者のみです。
        </p>
      </header>

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

      <Link href="/tenant" className="text-sm underline underline-offset-2">
        テナント管理へ戻る
      </Link>
    </main>
  );
}
