import { notFound, redirect } from "next/navigation";

import { OrderCancel } from "@/components/buyer/order-cancel";
import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import {
  OrderAmounts,
  OrderLines,
  ShippingAddressBlock,
} from "@/components/ui/order-summary";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { canRequestCancel, ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { getOrder } from "@/lib/orders/store";

export const metadata = { title: "注文の詳細" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 注文の詳細（docs/00 5.1）。
 *
 * 他人の注文は RLS で読めず、そのまま 404 になる。「あなたの注文では
 * ありません」とは出さない（存在を外から確かめられないようにする）。
 */
export default async function BuyerOrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;

  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(`/login?next=${encodeURIComponent(`/orders/${id}`)}`);
    }
    throw error;
  }

  const order = await getOrder(context.client, id);
  if (!order) notFound();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/orders", label: "注文履歴" },
          { href: `/orders/${order.id}`, label: order.orderNumber },
        ]}
      />

      <PageHeader
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <span>{DATE_FORMAT.format(new Date(order.placedAt ?? order.createdAt))}</span>
          </span>
        }
      />

      {order.tenantName ? <p className="text-sm">販売者：{order.tenantName}</p> : null}

      {order.status === "pending" ? (
        <Alert tone="warning">
          お支払いがまだ完了していません。決済の準備が整うまでお待ちください。
          在庫の確保期限を過ぎると、ご注文は自動的に取り消されます。
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="ご注文の内容" />
        <OrderLines lines={order.lines} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="お支払い" />
        <OrderAmounts order={order} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="お届け先" />
        <ShippingAddressBlock address={order.shippingAddress} />
        <p className="text-xs leading-5 text-subtle">
          配送先の登録を直しても、このご注文のお届け先は変わりません。
        </p>
      </section>

      {canRequestCancel(order.status) ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="ご注文の取消" />
          <OrderCancel orderId={order.id} status={order.status} />
        </section>
      ) : null}

      <p className="text-sm text-muted">
        決済と精算はマーケット運営本部が代行します。ご不明な点は
        <TextLink href="/legal/terms">利用規約</TextLink>
        をご確認ください。
      </p>
    </PageShell>
  );
}
