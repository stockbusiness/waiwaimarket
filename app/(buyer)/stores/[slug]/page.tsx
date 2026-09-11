import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/buyer/product-card";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { listPublicProducts } from "@/lib/products/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 公開店舗ページ（docs/00 5.1、docs/06 4.1「ログイン不要で閲覧可能」）。
 *
 * 購入者面の anon クライアントで読む。0004 の stores_public_read が
 * 「公開かつ承認済みテナント」に限っているため、未承認・停止中テナントの
 * 店舗はここに出ない。特商法表記は 0008 の legal_public_read で読める。
 */
export default async function StorePage(props: PageProps<"/stores/[slug]">) {
  const { slug } = await props.params;
  const supabase = await createSupabaseServerClient("buyer");

  const { data: store } = await supabase
    .from("stores")
    .select("tenant_id, display_name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!store) notFound();

  // 店舗の商品。公開判定は RLS が持つので、ここでは店舗で絞るだけ
  const products = await listPublicProducts({ store: slug });

  const { data: legal } = await supabase
    .from("tenant_legal_profiles")
    .select(
      "legal_name, representative_name, address, phone, email, invoice_registration_number, return_policy",
    )
    .eq("tenant_id", store.tenant_id)
    .maybeSingle();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: `/stores/${slug}`, label: store.display_name },
        ]}
      />
      <PageHeader
        title={store.display_name}
        description={
          store.description ? (
            <span className="whitespace-pre-line">{store.description}</span>
          ) : undefined
        }
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="取扱商品"
          action={
            products.total > products.items.length ? (
              <TextLink href={`/products?store=${slug}`}>
                すべて見る（{products.total} 件）
              </TextLink>
            ) : null
          }
        />
        {products.items.length === 0 ? (
          <p className="text-sm text-muted">公開されている商品がありません。</p>
        ) : (
          <ProductGrid products={products.items} />
        )}
      </section>

      {legal ? (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <SectionHeader title="特定商取引法に基づく表記" />
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="販売事業者">{legal.legal_name}</Row>
            <Row label="代表責任者">{legal.representative_name}</Row>
            <Row label="所在地">{legal.address}</Row>
            <Row label="電話番号">{legal.phone}</Row>
            <Row label="メールアドレス">{legal.email}</Row>
            {legal.invoice_registration_number ? (
              <Row label="登録番号">{legal.invoice_registration_number}</Row>
            ) : null}
            {legal.return_policy ? (
              <Row label="返品条件">
                <span className="whitespace-pre-line">{legal.return_policy}</span>
              </Row>
            ) : null}
          </dl>
          <p className="text-xs leading-5 text-subtle">
            販売者は上記の事業者です。決済と精算はマーケット運営本部が代行します。
          </p>
        </section>
      ) : null}
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-muted sm:w-36">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
