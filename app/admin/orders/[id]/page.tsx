import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import {
  OrderAmounts,
  OrderLines,
  ShippingAddressBlock,
} from "@/components/ui/order-summary";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { getOrder } from "@/lib/orders/store";

export const metadata = { title: "注文（監督）" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 本部から見た 1 件（docs/00 5.3「注文確認」）。**閲覧のみ。**
 *
 * 操作の入力欄も出さない。画面だけ出して API が拒否する形にすると、
 * 担当者は何度も押すことになる（0014 の本部画面と同じ判断）。
 */
export default async function AdminOrderPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const context = await withPageGuard("hq", requireHqOperator);
  const { id } = await params;

  const order = await getOrder(context.client, id);
  if (!order) notFound();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/orders", label: "注文" },
          { href: `/admin/orders/${order.id}`, label: order.orderNumber },
        ]}
      />

      <PageHeader
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <span>{order.tenantName ?? "（店舗名なし）"}</span>
          </span>
        }
      />

      <dl className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
        <div className="flex gap-2">
          <dt className="text-muted">受付</dt>
          <dd>{DATE_FORMAT.format(new Date(order.placedAt ?? order.createdAt))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">販売者</dt>
          <dd>
            <TextLink href={`/admin/tenants/${order.tenantId}`}>テナントを見る</TextLink>
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <SectionHeader title="注文の内容" />
        <OrderLines lines={order.lines} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="金額" />
        <OrderAmounts order={order} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="お届け先" />
        <ShippingAddressBlock address={order.shippingAddress} />
      </section>

      <Alert tone="warning">
        本部からは発送・取消を行えません。テナントの操作です。対応が滞っている場合は、
        テナントへ別途ご連絡ください。
      </Alert>
    </PageShell>
  );
}
