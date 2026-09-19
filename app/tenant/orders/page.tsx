import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { formatYen } from "@/lib/orders/money";
import { isOrderStatus, ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { listOrders } from "@/lib/orders/store";

export const metadata = { title: "受注" };

/** 既定は「発送待ち」。テナントが手を付けるべきもの */
const FILTERS = [
  { value: "paid", label: "発送待ち" },
  { value: "shipped", label: "発送済み" },
  { value: "pending", label: "決済待ち" },
  { value: "cancelled", label: "キャンセル" },
  { value: "all", label: "すべて" },
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function TenantOrdersPage({
  searchParams,
}: PageProps<"/tenant/orders">) {
  const context = await withPageGuard("tenant", requireTenantUser);

  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : undefined;
  const filter = raw === "all" ? undefined : raw && isOrderStatus(raw) ? raw : "paid";

  const orders = await listOrders(
    context.client,
    { by: "tenant", tenantIds: context.memberships.map((m) => m.tenantId) },
    filter,
  );

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/orders", label: "受注" },
        ]}
      />

      <PageHeader
        title="受注"
        description={
          filter === "paid"
            ? `発送待ち ${orders.length} 件。古い順に手を付けてください。`
            : `${orders.length} 件`
        }
      />

      <nav aria-label="状態で絞り込む" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {FILTERS.map((option) => {
          const active =
            option.value === "all" ? filter === undefined : filter === option.value;
          return (
            <span key={option.value}>
              {active ? (
                <span aria-current="page" className="font-bold">
                  {option.label}
                </span>
              ) : (
                <TextLink href={`/tenant/orders?status=${option.value}`}>
                  {option.label}
                </TextLink>
              )}
            </span>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted">該当するご注文はありません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/tenant/orders/${order.id}`}>
                      <span className="font-medium">{order.orderNumber}</span>
                    </TextLink>
                    <Badge>{ORDER_STATUS_LABEL[order.status]}</Badge>
                  </div>
                  <p className="text-muted">
                    {order.itemCount} 点・{formatYen(order.totalCharged)}
                    （うち送料 {formatYen(order.shippingFee)}）
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
