import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listProducts } from "@/lib/products/manage";
import { PRODUCT_STATUS_LABEL } from "@/lib/products/status";

export const metadata = { title: "商品" };

export default async function TenantProductsPage() {
  const context = await withPageGuard("tenant", requireTenantUser);
  const membership = context.memberships[0];
  if (!membership) redirect("/tenant");

  const products = await listProducts(context.client, membership.tenantId);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/products", label: "商品" },
        ]}
      />

      <PageHeader
        title="商品"
        description={`${products.length} 件。審査に通った商品だけが公開されます。`}
        actions={<ButtonLink href="/tenant/products/new">商品を追加</ButtonLink>}
      />

      {products.length === 0 ? (
        <p className="text-sm text-muted">まだ商品がありません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/tenant/products/${product.id}`}>
                      <span className="font-medium">{product.title}</span>
                    </TextLink>
                    <Badge>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
                  </div>
                  <p className="text-muted">
                    SKU {product.variantCount} 件・画像 {product.imageCount} 枚
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
