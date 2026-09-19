import { notFound, redirect } from "next/navigation";

import { CheckoutStart } from "@/components/buyer/checkout-start";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { listAddresses } from "@/lib/addresses/store";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { listCarts } from "@/lib/cart/cart";

export const metadata = { title: "購入手続き" };

/**
 * 購入手続き（docs/06 4.2、フェーズ3）。
 *
 * 1 回の決済につき 1 テナントなので、カートごとに 1 画面になる。
 *
 * 在庫の引当はこの画面で「送料を確定する」を押したときに走る
 * （`POST /api/market/checkout/preview`）。画面を開いただけでは
 * 引き当てない。開いて離脱するだけで在庫が 15 分押さえられるのを避ける。
 *
 * Next.js 16 では `params` が Promise（CLAUDE.md）。
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ cartId: string }>;
}) {
  const { cartId } = await params;

  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(`/login?next=%2Fcheckout%2F${encodeURIComponent(cartId)}`);
    }
    throw error;
  }

  // RLS が他人のカートを弾く。読めなければ存在しない
  const carts = await listCarts(context.client, context.user.id);
  const cart = carts.find((row) => row.cartId === cartId);
  if (!cart) notFound();

  const addresses = await listAddresses(context.client);

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/cart", label: "カート" },
          { href: `/checkout/${cartId}`, label: "購入手続き" },
        ]}
      />
      <PageHeader
        title="購入手続き"
        description={cart.storeName ? `${cart.storeName} の商品` : undefined}
      />

      {cart.blockers.length > 0 ? (
        <Alert tone="error">
          {cart.blockers.join(" / ")}。カートを直してからお進みください。
        </Alert>
      ) : (
        <CheckoutStart cartId={cart.cartId} addresses={addresses} />
      )}
    </PageShell>
  );
}
