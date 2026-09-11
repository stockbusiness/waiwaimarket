import { redirect } from "next/navigation";

import { ProductForm } from "@/components/tenant/product-form";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listCategoryOptions } from "@/lib/products/categories";

export const metadata = { title: "商品を追加" };

export default async function TenantProductNewPage() {
  const context = await withPageGuard("tenant", requireTenantUser);
  const membership = context.memberships[0];
  if (!membership) redirect("/tenant");

  const categories = await listCategoryOptions(context.client);

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/products", label: "商品" },
          { href: "/tenant/products/new", label: "追加" },
        ]}
      />

      <PageHeader
        title="商品を追加"
        description="まず商品名と説明を保存します。SKU（価格・在庫）と画像は、保存したあとの画面で登録します。"
      />

      <ProductForm
        tenantId={membership.tenantId}
        categories={categories}
        initial={{ title: "", description: "", categoryId: null }}
        warnsReReview={false}
      />
    </PageShell>
  );
}
