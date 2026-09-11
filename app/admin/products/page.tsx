import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listProductsForReview } from "@/lib/products/review";
import { PRODUCT_STATUS_LABEL } from "@/lib/products/status";
import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "商品審査" };

/** 絞り込みの選択肢。既定は審査待ち（本部が判断すべきもの） */
const FILTERS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "submitted", label: "審査待ち" },
  { value: "approved", label: "公開中" },
  { value: "rejected", label: "差し戻し" },
  { value: "suspended", label: "販売停止" },
  { value: "all", label: "すべて" },
];

function isFilter(value: string | undefined): value is ProductStatus | "all" {
  return FILTERS.some((filter) => filter.value === value);
}

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  const context = await withPageGuard("hq", requireHqOperator);

  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : undefined;
  const status = isFilter(raw) ? raw : "submitted";

  const products = await listProductsForReview(context.client, status);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/products", label: "商品審査" },
        ]}
      />

      <PageHeader
        title="商品審査"
        description={
          status === "submitted"
            ? `審査待ち ${products.length} 件。待たせている順に並んでいます。`
            : `${products.length} 件`
        }
      />

      <nav aria-label="状態で絞り込む" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {FILTERS.map((filter) => (
          <span key={filter.value}>
            {filter.value === status ? (
              <span aria-current="page" className="font-bold">
                {filter.label}
              </span>
            ) : (
              <TextLink href={`/admin/products?status=${filter.value}`}>
                {filter.label}
              </TextLink>
            )}
          </span>
        ))}
      </nav>

      {products.length === 0 ? (
        <p className="text-sm text-muted">
          {status === "submitted"
            ? "審査待ちの商品はありません。"
            : "該当する商品がありません。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/admin/products/${product.id}`}>
                      <span className="font-medium">{product.title}</span>
                    </TextLink>
                    <Badge>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
                  </div>
                  <p className="text-muted">{product.tenantName}</p>
                  <p className="text-muted">
                    SKU {product.variantCount} 件・画像 {product.imageCount} 枚・
                    {DATE_FORMAT.format(new Date(product.updatedAt))}
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
