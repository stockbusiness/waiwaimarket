import { notFound } from "next/navigation";

import { ProductReviewActions } from "@/components/admin/product-review-actions";
import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { getProductForReview } from "@/lib/products/review";
import {
  PRODUCT_REVIEW_ACTIONS,
  PRODUCT_STATUS_LABEL,
  canReviewTransition,
  reviewRequiresHqAdmin,
} from "@/lib/products/status";
import { supabaseUrl } from "@/lib/supabase/env";

export const metadata = { title: "商品の審査" };

const YEN = new Intl.NumberFormat("ja-JP");
const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function AdminProductReviewPage({
  params,
}: PageProps<"/admin/products/[id]">) {
  const context = await withPageGuard("hq", requireHqOperator);
  const { id } = await params;

  const product = await getProductForReview(context.client, id);
  if (!product) notFound();

  // いまの状態から進める操作だけを出す。権限は API 側でも見る
  const available = PRODUCT_REVIEW_ACTIONS.filter((action) =>
    canReviewTransition(product.status, action),
  );
  const isHqAdmin = context.role === "hq_admin";
  const actions = available.filter(
    (action) => isHqAdmin || !reviewRequiresHqAdmin(action),
  );
  const blocked = available.filter((action) => !actions.includes(action));

  const imageBase = `${supabaseUrl()}/storage/v1/object/public/product-images/`;

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/products", label: "商品審査" },
          { href: `/admin/products/${product.id}`, label: product.title },
        ]}
      />

      <PageHeader
        title={product.title}
        description={
          <>
            <Badge>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
            <span className="ml-2">
              <TextLink href={`/admin/tenants/${product.tenantId}`}>
                {product.tenantName}
              </TextLink>
            </span>
          </>
        }
      />

      {product.tenantStatus !== "approved" ? (
        <Alert tone="warning">
          このテナントは承認済みではありません（現在：{product.tenantStatus}）。
          商品を承認しても、テナントが承認されるまで公開されません。
        </Alert>
      ) : null}

      {product.reviewNote ? (
        <Alert tone="warning">
          前回の所見：{product.reviewNote}
          {product.reviewedAt
            ? `（${DATE_FORMAT.format(new Date(product.reviewedAt))}）`
            : ""}
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="内容" />
        <Card>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted">カテゴリー</dt>
              <dd>{product.categoryName ?? "（未設定）"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted">説明</dt>
              <dd className="whitespace-pre-wrap leading-7">
                {product.description || "（未入力）"}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title={`画像（${product.images.length} 枚）`} />
        {product.images.length === 0 ? (
          <p className="text-sm text-muted">画像がありません。</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {product.images.map((image, index) => (
              <li key={image.id}>
                {/* next/image を使わない。Storage のホストごとに設定が要るうえ、
                    審査画面の数枚に最適化の価値がない */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${imageBase}${image.storagePath}`}
                  alt={`商品画像 ${index + 1}`}
                  className="aspect-square w-full max-w-full rounded-lg border border-line object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title={`SKU（${product.variants.length} 件）`} />
        {product.variants.length === 0 ? (
          <p className="text-sm text-muted">SKU がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {product.variants.map((variant) => (
              <li
                key={variant.id}
                className="rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{variant.sku}</span>
                  {variant.optionLabel ? <span>{variant.optionLabel}</span> : null}
                  <span className="font-medium">
                    {YEN.format(variant.priceInclTax)} 円
                  </span>
                  <span className="text-muted">
                    税 {Math.round(variant.taxRate * 100)}%
                  </span>
                  <span className="text-muted">在庫 {variant.quantity}</span>
                  {variant.isActive ? null : <Badge>販売しない</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="審査" />
        {available.length === 0 ? (
          <p className="text-sm text-muted">
            この状態では本部から行える操作がありません。テナントが直して出し直すのを待ちます。
          </p>
        ) : (
          <ProductReviewActions
            productId={product.id}
            actions={actions}
            requiresHqAdmin={blocked}
          />
        )}
      </section>
    </PageShell>
  );
}
