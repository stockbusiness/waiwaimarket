import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { formatYen } from "@/lib/orders/money";
import { isOrderStatus, ORDER_STATUS_LABEL } from "@/lib/orders/status";
import { listOrders } from "@/lib/orders/store";

export const metadata = { title: "注文（監督）" };

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "決済待ち" },
  { value: "paid", label: "発送待ち" },
  { value: "shipped", label: "発送済み" },
  { value: "cancelled", label: "キャンセル" },
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 本部の注文一覧（docs/00 5.3「注文確認」）。
 *
 * **読むだけ。** 0002 は本部に `hq_read_orders`（select）しか与えていない。
 * 発送も取消もテナントの操作で、本部が代わりに押すと「誰が判断したか」が
 * 記録から消える。運用で必要になったら、代行の記録が残る形で別に設計する。
 */
export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  const context = await withPageGuard("hq", requireHqOperator);

  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : undefined;
  const filter = raw && isOrderStatus(raw) ? raw : undefined;

  const orders = await listOrders(context.client, { by: "hq" }, filter);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/orders", label: "注文" },
        ]}
      />

      <PageHeader
        title="注文"
        description="全テナント分を閲覧できます。発送・取消はテナントが行います。"
      />

      <nav aria-label="状態で絞り込む" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {FILTERS.map((option) => {
          const current = option.value === "all" ? undefined : option.value;
          return (
            <span key={option.value}>
              {current === filter ? (
                <span aria-current="page" className="font-bold">
                  {option.label}
                </span>
              ) : (
                <TextLink
                  href={current ? `/admin/orders?status=${current}` : "/admin/orders"}
                >
                  {option.label}
                </TextLink>
              )}
            </span>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted">該当する注文はありません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/admin/orders/${order.id}`}>
                      <span className="font-medium">{order.orderNumber}</span>
                    </TextLink>
                    <Badge>{ORDER_STATUS_LABEL[order.status]}</Badge>
                  </div>
                  <p className="text-muted">{order.tenantName ?? "（店舗名なし）"}</p>
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
