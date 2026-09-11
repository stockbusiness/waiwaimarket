import { ProductGrid } from "@/components/buyer/product-card";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { listPublicCategories, listPublicProducts } from "@/lib/products/public";

/**
 * トップページ。新着の公開商品を並べる。
 *
 * ログインの入口はヘッダーとフッターに置いてあるので、ここでは繰り返さない。
 * 最初に目に入るのが 3 つのログインリンクだと、何を売っている場所なのかが
 * 伝わらない。
 */
export default async function Home() {
  const [products, categories] = await Promise.all([
    listPublicProducts({ page: 1 }),
    listPublicCategories(),
  ]);

  return (
    <PageShell width="wide">
      <PageHeader
        title="審査を通過したお店だけが出品するマーケット"
        description="販売者は各テナントです。決済と精算はマーケット運営本部が代行します。"
      />

      {categories.length > 0 ? (
        <nav aria-label="カテゴリー" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {categories.map((category) => (
            <TextLink key={category.slug} href={`/products?category=${category.slug}`}>
              {category.name}
            </TextLink>
          ))}
        </nav>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="新着の商品"
          action={
            products.total > 0 ? <TextLink href="/products">すべて見る</TextLink> : null
          }
        />

        {products.items.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted">
              まだ公開されている商品がありません。出店をお考えの方は申請をお待ちしています。
            </p>
            <ButtonLink href="/tenant/login" variant="secondary">
              出店する
            </ButtonLink>
          </div>
        ) : (
          <ProductGrid products={products.items} />
        )}
      </section>
    </PageShell>
  );
}
