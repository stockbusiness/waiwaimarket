import { notFound } from "next/navigation";

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

  const { data: legal } = await supabase
    .from("tenant_legal_profiles")
    .select(
      "legal_name, representative_name, address, phone, email, invoice_registration_number, return_policy",
    )
    .eq("tenant_id", store.tenant_id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{store.display_name}</h1>
        {store.description ? (
          <p className="whitespace-pre-line text-sm leading-6 text-zinc-700">
            {store.description}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">取扱商品</h2>
        <p className="text-sm text-zinc-600">
          商品一覧はフェーズ2 で追加します。
        </p>
      </section>

      {legal ? (
        <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-medium">特定商取引法に基づく表記</h2>
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
          <p className="text-xs leading-5 text-zinc-500">
            販売者は上記の事業者です。決済と精算はマーケット運営本部が代行します。
          </p>
        </section>
      ) : null}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-zinc-600 sm:w-36">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
