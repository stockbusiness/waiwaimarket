import { notFound } from "next/navigation";

import { OrderActions } from "@/components/tenant/order-actions";
import { Badge } from "@/components/ui/alert";
import {
  OrderAmounts,
  OrderLines,
  ShippingAddressBlock,
} from "@/components/ui/order-summary";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { canActAsTenantMember } from "@/lib/auth/roles";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { getOrder } from "@/lib/orders/store";

export const metadata = { title: "受注の詳細" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 1 件の受注（docs/06 フェーズ3-4・3-5）。
 *
 * RLS（`orders_tenant_read`）で他店の注文は読めないが、画面側でも所属を
 * 確かめる（docs/00 8.2「RLS だけに依存しない」）。
 */
export default async function TenantOrderPage({
  params,
}: PageProps<"/tenant/orders/[id]">) {
  const context = await withPageGuard("tenant", requireTenantUser);
  const { id } = await params;

  const order = await getOrder(context.client, id);
  if (!order || !canActAsTenantMember(context.memberships, order.tenantId)) {
    notFound();
  }

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/orders", label: "受注" },
          { href: `/tenant/orders/${order.id}`, label: order.orderNumber },
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

      <section className="flex flex-col gap-3">
        <SectionHeader title="ご注文の内容" />
        <OrderLines lines={order.lines} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="金額" />
        <OrderAmounts order={order} />
        <p className="text-xs leading-5 text-subtle">
          販売手数料を差し引いた受取額は、精算の画面で確認できるようになります
          （実装はフェーズ5）。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="お届け先" />
        <ShippingAddressBlock address={order.shippingAddress} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="操作" />
        <OrderActions orderId={order.id} status={order.status} />
      </section>
    </PageShell>
  );
}
