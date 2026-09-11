import { redirect } from "next/navigation";

import { StoreForm } from "@/components/tenant/store-form";
import { TextLink } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "店舗ページ" };

export default async function TenantStorePage() {
  const context = await withPageGuard("tenant", requireTenantUser);
  const membership = context.memberships[0];
  if (!membership) redirect("/tenant");

  const { data: store } = await context.client
    .from("stores")
    .select("slug, display_name, description, is_public")
    .eq("tenant_id", membership.tenantId)
    .maybeSingle();

  return (
    <PageShell width="form">
      <PageHeader
        title="店舗ページ"
        description="公開ページの URL と紹介文を設定します。"
        actions={
          store?.slug ? (
            <span className="text-sm">
              <TextLink href={`/stores/${store.slug}`}>公開ページを見る</TextLink>
            </span>
          ) : null
        }
      />

      <StoreForm
        tenantId={membership.tenantId}
        initial={{
          slug: store?.slug ?? "",
          displayName: store?.display_name ?? "",
          description: store?.description ?? "",
          isPublic: store?.is_public ?? false,
        }}
      />

      <p className="text-sm">
        <TextLink href="/tenant">テナント管理へ戻る</TextLink>
      </p>
    </PageShell>
  );
}
