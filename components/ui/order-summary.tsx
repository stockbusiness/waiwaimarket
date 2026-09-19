import { formatAddress, type ShippingAddressSnapshot } from "@/lib/addresses/address";
import { formatYen } from "@/lib/orders/money";
import type { OrderDetail } from "@/lib/orders/store";

/**
 * 注文の金額と明細と届け先（0015）。購入者・テナント・本部の 3 面で使う。
 *
 * **金額は注文行に保存された値をそのまま出す。** 画面で足し直さない。
 * 商品の値段が後から変わっても、注文の金額は変わってはいけない。
 * 合計と内訳の関係は 0003 の検査制約（`orders_total_consistent`）が
 * DB 側で保証している。
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OrderLines({ lines }: { lines: OrderDetail["lines"] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li
          key={line.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
        >
          <span className="min-w-0 break-words">
            {line.productTitle}
            <span className="ml-2 text-muted">×{line.quantity}</span>
            {line.refundedQuantity > 0 ? (
              <span className="ml-2 text-xs text-danger">
                （{line.refundedQuantity} 点返品）
              </span>
            ) : null}
          </span>
          <span className="font-bold">{formatYen(line.lineTotalInclTax)}</span>
        </li>
      ))}
    </ul>
  );
}

export function OrderAmounts({ order }: { order: OrderDetail }) {
  return (
    <dl className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-4 text-sm">
      <Row label="小計">{formatYen(order.subtotalInclTax)}</Row>
      <Row label="送料">
        {order.shippingFee === 0 ? "無料" : formatYen(order.shippingFee)}
      </Row>
      {order.pointDiscount > 0 ? (
        <Row label="オーリーポイント利用">-{formatYen(order.pointDiscount)}</Row>
      ) : null}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
        <dt className="font-bold">お支払い金額</dt>
        <dd className="text-lg font-bold">{formatYen(order.totalCharged)}</dd>
      </div>
    </dl>
  );
}

export function ShippingAddressBlock({
  address,
}: {
  address: ShippingAddressSnapshot | null;
}) {
  if (!address) {
    return <p className="text-sm text-muted">お届け先を表示できません。</p>;
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-raised p-4 text-sm">
      <span className="font-bold">{address.recipientName}</span>
      <span className="break-words text-muted">{formatAddress(address)}</span>
      <span className="text-muted">{address.phone}</span>
    </div>
  );
}
