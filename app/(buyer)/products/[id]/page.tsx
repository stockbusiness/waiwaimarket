import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { formatPriceRange, formatYen } from "@/lib/products/price";
import { getPublicProduct } from "@/lib/products/public";

/**
 * 公開の商品詳細（docs/00 5.1、docs/06 4.1）。
 *
 * 公開されていない商品は RLS で読めないため、そのまま 404 になる。
 * 「審査中です」とは出さない。未公開の商品の存在を外に知らせないため。
 *
 * カートへの導線はまだ置かない（フェーズ3）。
 */

export async function generateMetadata({
  params,
}: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProduct(id);
  if (!product) return { title: "商品が見つかりません" };

  return {
    title: product.title,
    description: product.description?.slice(0, 120) ?? undefined,
    openGraph: {
      title: product.title,
      images: product.images[0] ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: PageProps<"/products/[id]">) {
  const { id } = await params;
  const product = await getPublicProduct(id);
  if (!product) notFound();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/products", label: "商品一覧" },
          ...(product.categorySlug && product.categoryName
            ? [
                {
                  href: `/products?category=${product.categorySlug}`,
                  label: product.categoryName,
                },
              ]
            : []),
          { href: `/products/${product.id}`, label: product.title },
        ]}
      />

      {product.images.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {product.images.map((image, index) => (
            <li key={image.id}>
              {/* next/image を使わない（Storage のホストごとに設定が要る）。
                  1 枚目だけ先に読む */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={`${product.title} の写真 ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                className="w-full max-w-full rounded-xl border border-line bg-surface object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <PageHeader
        title={product.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-body">
              {formatPriceRange(product.price)}
            </span>
            {product.inStock ? null : <Badge>在庫なし</Badge>}
          </span>
        }
      />

      {product.storeSlug && product.storeName ? (
        <p className="text-sm">
          販売者：
          <TextLink href={`/stores/${product.storeSlug}`}>{product.storeName}</TextLink>
        </p>
      ) : null}

      {product.description ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="商品の説明" />
          <p className="text-sm leading-7 whitespace-pre-wrap">{product.description}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="種類と価格" />
        {product.variants.length === 0 ? (
          <p className="text-sm text-muted">現在販売している種類がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {product.variants.map((variant) => (
              <li
                key={variant.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
              >
                <span>{variant.optionLabel ?? variant.sku}</span>
                <span className="flex items-center gap-3">
                  <span className="font-bold">{formatYen(variant.priceInclTax)}</span>
                  {variant.inStock ? null : (
                    <span className="text-xs text-muted">在庫なし</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-5 text-subtle">
          価格は税込です。送料は購入手続きの際に計算されます。
        </p>
      </section>

      {product.storeSlug ? (
        <p className="text-sm text-muted">
          販売者の事業者情報（特定商取引法に基づく表記）は
          <TextLink href={`/stores/${product.storeSlug}`}>店舗ページ</TextLink>
          に掲載しています。決済と精算はマーケット運営本部が代行します。
        </p>
      ) : null}
    </PageShell>
  );
}
