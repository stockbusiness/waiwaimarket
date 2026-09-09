import Link from "next/link";
import { redirect } from "next/navigation";

import { StoreForm } from "@/components/tenant/store-form";
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
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">店舗ページ</h1>
        {store?.slug ? (
          <Link
            href={`/stores/${store.slug}`}
            className="text-sm underline underline-offset-2"
          >
            公開ページを見る
          </Link>
        ) : null}
      </header>

      <StoreForm
        tenantId={membership.tenantId}
        initial={{
          slug: store?.slug ?? "",
          displayName: store?.display_name ?? "",
          description: store?.description ?? "",
          isPublic: store?.is_public ?? false,
        }}
      />

      <Link href="/tenant" className="text-sm underline underline-offset-2">
        テナント管理へ戻る
      </Link>
    </main>
  );
}
