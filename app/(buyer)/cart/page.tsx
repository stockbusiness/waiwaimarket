import { redirect } from "next/navigation";

import { CartItems } from "@/components/buyer/cart-items";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireBuyer } from "@/lib/auth/guard";
import { AuthorizationError } from "@/lib/auth/errors";
import { listCarts, type CartView } from "@/lib/cart/cart";
import { formatYen } from "@/lib/orders/money";

export const metadata = { title: "カート" };

/**
 * カート（docs/06 4.2、フェーズ3-1）。
 *
 * 店舗ごとに分けて表示する。1 回の決済につき 1 テナントのため、
 * 購入手続きも店舗ごとになる。
 *
 * 金額はすべてサーバーで計算したものを表示する。
 */
export default async function CartPage() {
  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login?next=%2Fcart");
    }
    throw error;
  }

  const carts = await listCarts(context.client, context.user.id);

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/cart", label: "カート" },
        ]}
      />

      <PageHeader
        title="カート"
        description={
          carts.length > 1
            ? "1 回の決済につき 1 店舗です。店舗ごとに購入手続きを行います。"
            : undefined
        }
      />

      {carts.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">カートは空です。</p>
          <ButtonLink href="/products">商品を探す</ButtonLink>
        </div>
      ) : (
        carts.map((cart) => <CartSection key={cart.cartId} cart={cart} />)
      )}
    </PageShell>
  );
}

function CartSection({ cart }: { cart: CartView }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="text-lg font-bold tracking-tight">
        {cart.storeSlug && cart.storeName ? (
          <TextLink href={`/stores/${cart.storeSlug}`}>{cart.storeName}</TextLink>
        ) : (
          (cart.storeName ?? "店舗")
        )}
      </h2>

      <CartItems lines={cart.lines} />

      <Card>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="小計">{formatYen(cart.amounts.subtotalInclTax)}</Row>
          <Row label="送料">
            {cart.amounts.shippingFee === 0 && !cart.amounts.shippingVaries
              ? "無料"
              : // 届け先が決まるまで確定しない。下限に「〜」を添える
                `${formatYen(cart.amounts.shippingFee)}${cart.amounts.shippingVaries ? "〜" : ""}`}
          </Row>

          {cart.amounts.taxes.map((bucket) => (
            <Row
              key={bucket.rate}
              label={`（内 消費税 ${Math.round(bucket.rate * 100)}%）`}
            >
              <span className="text-muted">{formatYen(bucket.tax)}</span>
            </Row>
          ))}

          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
            <dt className="font-bold">合計</dt>
            <dd className="text-lg font-bold">
              {formatYen(cart.amounts.totalCharged)}
              {cart.amounts.shippingVaries ? "〜" : ""}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs leading-5 text-subtle">
          発送の目安は約 {cart.shipping.leadTimeDays} 日です。消費税は商品代と
          送料に含まれています（送料は 10%）。
          {cart.amounts.shippingVaries
            ? "送料はお届け先の都道府県によって変わるため、購入手続きで確定します。"
            : null}
        </p>
      </Card>

      {cart.blockers.length > 0 ? (
        <Alert tone="error">{cart.blockers.join(" / ")}</Alert>
      ) : null}

      {/* 購入手続きはフェーズ3 の決済と一緒に入る。導線はまだ置かない */}
      <p className="text-sm text-muted">
        購入手続きは準備中です。決済の接続が終わり次第ご利用いただけます。
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
