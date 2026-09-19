import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { formatYen } from "@/lib/orders/money";
import { ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { listOrders } from "@/lib/orders/store";

export const metadata = { title: "注文履歴" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 購入者の注文一覧（docs/00 5.1「注文履歴」）。
 *
 * 0002 の `orders_buyer_read` が自分の注文だけに絞る。
 */
export default async function BuyerOrdersPage() {
  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login?next=%2Forders");
    }
    throw error;
  }

  const orders = await listOrders(context.client, {
    by: "buyer",
    buyerId: context.user.id,
  });

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/orders", label: "注文履歴" },
        ]}
      />
      <PageHeader title="注文履歴" description="ご注文の状況を確認できます。" />

      {orders.length === 0 ? (
        <p className="text-sm text-muted">
          ご注文はまだありません。
          <span className="ml-1">
            <TextLink href="/products">商品を探す</TextLink>
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/orders/${order.id}`}>
                      <span className="font-medium">{order.orderNumber}</span>
                    </TextLink>
                    <Badge>{ORDER_STATUS_LABEL[order.status]}</Badge>
                  </div>
                  {order.tenantName ? (
                    <p className="text-muted">{order.tenantName}</p>
                  ) : null}
                  <p className="text-muted">
                    {order.itemCount} 点・{formatYen(order.totalCharged)}
                  </p>
                  <p className="text-xs text-subtle">
                    {DATE_FORMAT.format(new Date(order.placedAt ?? order.createdAt))}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
