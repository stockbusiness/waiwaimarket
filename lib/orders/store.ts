import "server-only";

import { parseSnapshot, type ShippingAddressSnapshot } from "@/lib/addresses/address";
import type { Json, OrderStatus } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 注文の読み取り（docs/04 9.1・9.2・9.3）。
 *
 * 呼び出し元のセッションのクライアントを受け取る。0002 の
 * `orders_buyer_read` / `orders_tenant_read` / `hq_read_orders` が
 * それぞれの範囲に絞るので、API 側の認可と RLS の二重になる
 * （CLAUDE.md「認可は RLS と API の両方で行う」）。
 *
 * **埋め込み（PostgREST の `select("...stores(...)")`）を使わない。**
 * 埋め込んだ先にも RLS がかかるため、面ごとに欠ける列が変わる。
 * IDで引き直して突き合わせる（lib/products/public.ts と同じ形）。
 */

export type OrderLine = {
  id: string;
  variantId: string;
  productTitle: string;
  unitPriceInclTax: number;
  quantity: number;
  lineTotalInclTax: number;
  refundedQuantity: number;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  tenantId: string;
  tenantName: string | null;
  status: OrderStatus;
  subtotalInclTax: number;
  shippingFee: number;
  pointDiscount: number;
  totalCharged: number;
  placedAt: string | null;
  createdAt: string;
  itemCount: number;
};

export type OrderDetail = OrderSummary & {
  buyerId: string;
  shippingAddress: ShippingAddressSnapshot | null;
  lines: OrderLine[];
};

// **文字列リテラルのまま書く。** `"..." + "..."` と連結すると PostgREST の
// 型推論が効かなくなり、行の型が `GenericStringError` に落ちる
const COLUMNS =
  "id, order_number, buyer_id, tenant_id, status, subtotal_incl_tax, shipping_fee, point_discount, total_charged, shipping_address, placed_at, created_at";

type Row = {
  id: string;
  order_number: string;
  buyer_id: string;
  tenant_id: string;
  status: OrderStatus;
  subtotal_incl_tax: number;
  shipping_fee: number;
  point_discount: number;
  total_charged: number;
  shipping_address: Json;
  placed_at: string | null;
  created_at: string;
};

/**
 * テナントの表示名。
 *
 * 購入者は `tenants` を読めない（0004）。公開の店舗ページ（`stores`）の
 * 名前を先に引き、読めなかった分を `tenants` で補う
 * （lib/inquiries/store.ts と同じ形）。
 */
async function loadTenantNames(
  client: MarketSupabaseClient,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tenantIds.length === 0) return map;

  const [stores, tenants] = await Promise.all([
    client.from("stores").select("tenant_id, display_name").in("tenant_id", tenantIds),
    client.from("tenants").select("id, name").in("id", tenantIds),
  ]);

  for (const row of tenants.data ?? []) map.set(row.id, row.name);
  for (const row of stores.data ?? []) map.set(row.tenant_id, row.display_name);
  return map;
}

async function loadItemCounts(
  client: MarketSupabaseClient,
  orderIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;

  const { data, error } = await client
    .from("order_items")
    .select("order_id")
    .in("order_id", orderIds);

  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.order_id, (map.get(row.order_id) ?? 0) + 1);
  }
  return map;
}

function toSummary(row: Row, tenantName: string | null, itemCount: number): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    tenantId: row.tenant_id,
    tenantName,
    status: row.status,
    subtotalInclTax: row.subtotal_incl_tax,
    shippingFee: row.shipping_fee,
    pointDiscount: row.point_discount,
    totalCharged: row.total_charged,
    placedAt: row.placed_at,
    createdAt: row.created_at,
    itemCount,
  };
}

type ListScope =
  | { by: "buyer"; buyerId: string }
  | { by: "tenant"; tenantIds: string[] }
  | { by: "hq" };

/** 一覧。新しい順 */
export async function listOrders(
  client: MarketSupabaseClient,
  scope: ListScope,
  filter?: OrderStatus,
): Promise<OrderSummary[]> {
  let builder = client.from("orders").select(COLUMNS);

  if (scope.by === "buyer") builder = builder.eq("buyer_id", scope.buyerId);
  if (scope.by === "tenant") {
    if (scope.tenantIds.length === 0) return [];
    builder = builder.in("tenant_id", scope.tenantIds);
  }
  if (filter) builder = builder.eq("status", filter);

  const { data, error } = await builder.order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const [names, counts] = await Promise.all([
    loadTenantNames(client, [...new Set(rows.map((row) => row.tenant_id))]),
    loadItemCounts(client, rows.map((row) => row.id)),
  ]);

  return rows.map((row) =>
    toSummary(row, names.get(row.tenant_id) ?? null, counts.get(row.id) ?? 0),
  );
}

/** テナントの画面上部に出す「発送待ち」の件数 */
export async function countAwaitingShipment(
  client: MarketSupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count, error } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "paid");

  if (error) throw error;
  return count ?? 0;
}

/** 1 件。読めなければ null（RLS が絞る）。呼び出し側が 404 にする */
export async function getOrder(
  client: MarketSupabaseClient,
  id: string,
): Promise<OrderDetail | null> {
  const { data, error } = await client
    .from("orders")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Row;
  const [names, items] = await Promise.all([
    loadTenantNames(client, [row.tenant_id]),
    client
      .from("order_items")
      .select(
        "id, variant_id, product_title, unit_price_incl_tax, quantity, line_total_incl_tax, refunded_quantity",
      )
      .eq("order_id", id)
      .order("product_title"),
  ]);

  if (items.error) throw items.error;
  const lines = items.data ?? [];

  return {
    ...toSummary(row, names.get(row.tenant_id) ?? null, lines.length),
    buyerId: row.buyer_id,
    // 0013 の検査制約が形を守っているが、読む側でも確かめる。
    // 壊れていたら null にして、住所欄だけが空になるようにする
    shippingAddress: parseSnapshot(row.shipping_address),
    lines: lines.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      productTitle: line.product_title,
      unitPriceInclTax: line.unit_price_incl_tax,
      quantity: line.quantity,
      lineTotalInclTax: line.line_total_incl_tax,
      refundedQuantity: line.refunded_quantity,
    })),
  };
}
