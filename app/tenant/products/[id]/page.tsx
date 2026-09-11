import { notFound } from "next/navigation";

import { ImageUploader } from "@/components/tenant/image-uploader";
import { ProductForm } from "@/components/tenant/product-form";
import { ProductReviewRequest } from "@/components/tenant/product-review-request";
import { VariantEditor } from "@/components/tenant/variant-editor";
import { Alert, Badge } from "@/components/ui/alert";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listCategoryOptions } from "@/lib/products/categories";
import { getProduct } from "@/lib/products/manage";
import {
  PRODUCT_STATUS_LABEL,
  bodyChangeResetsReview,
  submitBlockers,
} from "@/lib/products/status";
import { canActAsTenantMember } from "@/lib/auth/roles";
import { supabaseUrl } from "@/lib/supabase/env";

export const metadata = { title: "商品の編集" };

export default async function TenantProductEditPage({
  params,
}: PageProps<"/tenant/products/[id]">) {
  const context = await withPageGuard("tenant", requireTenantUser);
  const { id } = await params;

  // RLS（products_tenant_read）で他テナントの商品は読めないが、
  // API と同じく画面側でも所属を確かめる（docs/00 8.2）
  const product = await getProduct(context.client, id);
  if (!product || !canActAsTenantMember(context.memberships, product.tenantId)) {
    notFound();
  }

  const categories = await listCategoryOptions(context.client);
  const blockers = submitBlockers({
    variantCount: product.variants.length,
    imageCount: product.images.length,
    hasCategory: product.categoryId !== null,
  });

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/products", label: "商品" },
          { href: `/tenant/products/${product.id}`, label: product.title },
        ]}
      />

      <PageHeader
        title={product.title}
        description={<Badge>{PRODUCT_STATUS_LABEL[product.status]}</Badge>}
      />

      {product.status === "rejected" ? (
        <Alert tone="warning">
          差し戻されています。
          {product.reviewNote
            ? `理由：${product.reviewNote}`
            : "理由は記載されていません。本部にお問い合わせください。"}
        </Alert>
      ) : null}

      {product.status === "suspended" ? (
        <Alert tone="error">
          本部により販売停止になっています。
          {product.reviewNote ? `理由：${product.reviewNote}` : ""}
        </Alert>
      ) : null}

      <ProductReviewRequest
        productId={product.id}
        status={product.status}
        blockers={blockers}
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="商品の内容" />
        <ProductForm
          productId={product.id}
          tenantId={product.tenantId}
          categories={categories}
          initial={{
            title: product.title,
            description: product.description ?? "",
            categoryId: product.categoryId,
          }}
          warnsReReview={bodyChangeResetsReview(product.status)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="画像" />
        <ImageUploader
          productId={product.id}
          tenantId={product.tenantId}
          images={product.images.map((image) => ({
            id: image.id,
            storagePath: image.storagePath,
          }))}
          publicUrlBase={`${supabaseUrl()}/storage/v1/object/public/product-images/`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="SKU・価格・在庫" />
        <VariantEditor
          productId={product.id}
          initial={product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            optionLabel: variant.optionLabel ?? "",
            priceInclTax: String(variant.priceInclTax),
            taxRate: variant.taxRate === 0.08 ? 0.08 : 0.1,
            quantity: String(variant.quantity),
            isActive: variant.isActive,
            reservedQuantity: variant.reservedQuantity,
          }))}
        />
      </section>
    </PageShell>
  );
}
