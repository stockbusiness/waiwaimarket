import { Pagination, ProductFilters } from "@/components/buyer/product-filters";
import { ProductGrid } from "@/components/buyer/product-card";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { listPublicCategories, listPublicProducts } from "@/lib/products/public";

export const metadata = { title: "商品一覧" };

/**
 * 公開の商品一覧（docs/00 5.1、docs/06 4.1「ログイン不要で閲覧可能」）。
 *
 * 公開判定は RLS が持つ。承認済み商品かつ承認済みテナントのものだけが
 * 返るため、この画面で status を絞る必要はない（絞ると判定が 2 か所に
 * 分かれ、片方だけ直したときに未承認商品が漏れる）。
 */
export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const params = await searchParams;

  const text = (value: string | string[] | undefined): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  const current = {
    category: text(params.category),
    q: text(params.q),
    store: text(params.store),
  };
  const page = Number(text(params.page) ?? "1");

  const [result, categories] = await Promise.all([
    listPublicProducts({
      ...current,
      page: Number.isFinite(page) ? page : 1,
    }),
    listPublicCategories(),
  ]);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/products", label: "商品一覧" },
        ]}
      />

      <PageHeader
        title="商品一覧"
        description={
          current.q
            ? `「${current.q}」の検索結果 ${result.total} 件`
            : `${result.total} 件`
        }
      />

      <ProductFilters categories={categories} current={current} />

      {result.items.length === 0 ? (
        <p className="text-sm text-muted">
          {current.q || current.category
            ? "条件に合う商品が見つかりませんでした。"
            : "まだ公開されている商品がありません。"}
        </p>
      ) : (
        <>
          <ProductGrid products={result.items} />
          <Pagination current={current} page={result.page} pageCount={result.pageCount} />
        </>
      )}
    </PageShell>
  );
}
