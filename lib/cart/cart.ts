import "server-only";

import {
  calculateOrderAmounts,
  type MoneyLine,
  type OrderAmounts,
  type ShippingRule,
  type TaxRate,
} from "@/lib/orders/money";
import { availableQuantity } from "@/lib/products/price";
import { productImageUrl } from "@/lib/products/public";
import { EMPTY_REGION_RULES, parseRegionRules } from "@/lib/shipping/region";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

import { MAX_ITEM_QUANTITY } from "./limits";

/**
 * カート（docs/06 4.2、フェーズ3-1）。
 *
 * **購入者ごと・テナントごとに 1 つ。** `carts` が 1カート1テナントで、
 * 0003 に `(buyer_id, tenant_id)` の一意索引がある。docs/06 4.2 の
 * 「画面上では商品を店舗別にまとめ、別々に購入手続きを行えるようにする」
 * に対応する形で、購入者は店舗ごとに複数のカートを持つ。
 *
 * **カート投入時には在庫を引き当てない**（docs/06 4.2）。引当は購入手続きの
 * 開始時。ここで在庫を見るのは表示のためだけで、買えるかどうかの判定は
 * 引当（0011 の reserve_inventory）が行う。
 *
 * 呼び出し元のセッションのクライアントを受け取る。0004 の carts_self_all /
 * cart_items_self_all が自分のカートだけに絞るので、RLS と API の二重に
 * なる（docs/00 8.2）。
 */

export { MAX_ITEM_QUANTITY };

export type CartLine = {
  itemId: string;
  variantId: string;
  productId: string;
  productTitle: string;
  optionLabel: string | null;
  imageUrl: string | null;
  unitPriceInclTax: number;
  taxRate: TaxRate;
  quantity: number;
  /** いま確保できる数。引当済みを引いた値 */
  availableQuantity: number;
  /** 数量が在庫を超えている。購入手続きに進めない */
  exceedsStock: boolean;
  /** 販売停止・非公開になった商品。購入手続きに進めない */
  unavailable: boolean;
};

export type CartView = {
  cartId: string;
  tenantId: string;
  storeSlug: string | null;
  storeName: string | null;
  lines: CartLine[];
  amounts: OrderAmounts;
  shipping: ShippingRule & { leadTimeDays: number };
  /** 購入手続きに進めない理由。空なら進める */
  blockers: string[];
};

/** 送料の既定。テナントが未設定なら送料無料・3 日で見積もる */
const DEFAULT_SHIPPING = {
  baseFee: 0,
  freeThreshold: null,
  regionRules: EMPTY_REGION_RULES,
  leadTimeDays: 3,
};

function toTaxRate(value: number): TaxRate {
  return Number(value) === 0.08 ? 0.08 : 0.1;
}

/**
 * 購入者のカートを店舗ごとに返す。
 *
 * 埋め込み（PostgREST の `select("...stores(...)")`）を使わない。
 * products と stores の間に外部キーが無いため（lib/products/public.ts と
 * 同じ理由）。テナントIDで引き直して突き合わせる。
 */
export async function listCarts(
  client: MarketSupabaseClient,
  buyerId: string,
): Promise<CartView[]> {
  const { data: carts, error } = await client
    .from("carts")
    .select("id, tenant_id, created_at")
    .eq("buyer_id", buyerId)
    .order("created_at");

  if (error) throw error;
  if (!carts || carts.length === 0) return [];

  const { data: items, error: itemError } = await client
    .from("cart_items")
    .select("id, cart_id, variant_id, quantity")
    .in(
      "cart_id",
      carts.map((cart) => cart.id),
    );

  if (itemError) throw itemError;

  const variantIds = [...new Set((items ?? []).map((item) => item.variant_id))];
  const [variants, shippingByTenant, stores] = await Promise.all([
    loadVariants(client, variantIds),
    loadShipping(
      client,
      carts.map((cart) => cart.tenant_id),
    ),
    loadStores(
      client,
      carts.map((cart) => cart.tenant_id),
    ),
  ]);

  return carts.map((cart) => {
    const cartItems = (items ?? []).filter((item) => item.cart_id === cart.id);
    const lines: CartLine[] = cartItems.map((item) => {
      const variant = variants.get(item.variant_id);
      const available = variant ? availableQuantity(variant.stock) : 0;

      return {
        itemId: item.id,
        variantId: item.variant_id,
        productId: variant?.productId ?? "",
        productTitle: variant?.productTitle ?? "（取り扱いが終了しました）",
        optionLabel: variant?.optionLabel ?? null,
        imageUrl: variant?.imageUrl ?? null,
        unitPriceInclTax: variant?.priceInclTax ?? 0,
        taxRate: variant?.taxRate ?? 0.1,
        quantity: item.quantity,
        availableQuantity: available,
        exceedsStock: item.quantity > available,
        // RLS で読めない＝公開されていない商品。販売停止や差戻しで起きる
        unavailable: !variant,
      };
    });

    // 買えない行は金額に入れない。合計が実際の請求額とずれる
    const moneyLines: MoneyLine[] = lines
      .filter((row) => !row.unavailable)
      .map((row) => ({
        unitPriceInclTax: row.unitPriceInclTax,
        quantity: row.quantity,
        taxRate: row.taxRate,
      }));

    const shipping = shippingByTenant.get(cart.tenant_id) ?? DEFAULT_SHIPPING;
    const store = stores.get(cart.tenant_id);

    const blockers: string[] = [];
    if (lines.some((row) => row.unavailable)) {
      blockers.push("販売が終了した商品があります");
    }
    if (lines.some((row) => !row.unavailable && row.exceedsStock)) {
      blockers.push("在庫が足りない商品があります");
    }

    return {
      cartId: cart.id,
      tenantId: cart.tenant_id,
      storeSlug: store?.slug ?? null,
      storeName: store?.displayName ?? null,
      lines,
      // 届け先の都道府県はカートの時点では分からない。送料は下限になり、
      // amounts.shippingVaries が真なら画面に「〜円から」と出す
      amounts: calculateOrderAmounts({
        lines: moneyLines,
        shipping: {
          baseFee: shipping.baseFee,
          freeThreshold: shipping.freeThreshold,
          regionRules: shipping.regionRules,
        },
      }),
      shipping,
      blockers,
    };
  });
}

type VariantInfo = {
  productId: string;
  productTitle: string;
  optionLabel: string | null;
  priceInclTax: number;
  taxRate: TaxRate;
  imageUrl: string | null;
  stock: {
    priceInclTax: number;
    isActive: boolean;
    quantity: number;
    reservedQuantity: number;
  };
};

async function loadVariants(
  client: MarketSupabaseClient,
  variantIds: string[],
): Promise<Map<string, VariantInfo>> {
  const map = new Map<string, VariantInfo>();
  if (variantIds.length === 0) return map;

  // 公開されていない商品の SKU は RLS で読めない。取り扱い終了として扱う
  const { data: variants, error } = await client
    .from("product_variants")
    .select("id, product_id, option_label, price_incl_tax, tax_rate, is_active")
    .in("id", variantIds);

  if (error) throw error;
  const rows = variants ?? [];
  if (rows.length === 0) return map;

  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const [products, inventories, images] = await Promise.all([
    client.from("products").select("id, title").in("id", productIds),
    client
      .from("inventories")
      .select("variant_id, quantity, reserved_quantity")
      .in(
        "variant_id",
        rows.map((row) => row.id),
      ),
    client
      .from("product_images")
      .select("product_id, storage_path, sort_order")
      .in("product_id", productIds)
      .order("sort_order"),
  ]);

  if (products.error) throw products.error;
  if (inventories.error) throw inventories.error;
  if (images.error) throw images.error;

  const titleById = new Map((products.data ?? []).map((row) => [row.id, row.title]));
  const stockById = new Map(
    (inventories.data ?? []).map((row) => [
      row.variant_id,
      { quantity: row.quantity, reserved: row.reserved_quantity },
    ]),
  );
  const coverByProduct = new Map<string, string>();
  for (const image of images.data ?? []) {
    if (!coverByProduct.has(image.product_id)) {
      coverByProduct.set(image.product_id, productImageUrl(image.storage_path));
    }
  }

  for (const row of rows) {
    const stock = stockById.get(row.id);
    map.set(row.id, {
      productId: row.product_id,
      productTitle: titleById.get(row.product_id) ?? "（不明な商品）",
      optionLabel: row.option_label,
      priceInclTax: row.price_incl_tax,
      taxRate: toTaxRate(row.tax_rate),
      imageUrl: coverByProduct.get(row.product_id) ?? null,
      stock: {
        priceInclTax: row.price_incl_tax,
        isActive: row.is_active,
        // 販売しない設定の SKU は在庫 0 として扱う。買えないことに変わりはない
        quantity: row.is_active ? (stock?.quantity ?? 0) : 0,
        reservedQuantity: stock?.reserved ?? 0,
      },
    });
  }
  return map;
}

async function loadShipping(
  client: MarketSupabaseClient,
  tenantIds: string[],
): Promise<Map<string, ShippingRule & { leadTimeDays: number }>> {
  const map = new Map<string, ShippingRule & { leadTimeDays: number }>();
  if (tenantIds.length === 0) return map;

  const { data, error } = await client
    .from("shipping_profiles")
    .select("tenant_id, base_fee, free_threshold, lead_time_days, region_rules")
    .in("tenant_id", tenantIds);

  if (error) throw error;
  for (const row of data ?? []) {
    // 1 テナント 1 件を想定。複数あれば最初の 1 件を使う
    if (map.has(row.tenant_id)) continue;
    map.set(row.tenant_id, {
      baseFee: row.base_fee,
      freeThreshold: row.free_threshold,
      regionRules: parseRegionRules(row.region_rules),
      leadTimeDays: row.lead_time_days,
    });
  }
  return map;
}

async function loadStores(
  client: MarketSupabaseClient,
  tenantIds: string[],
): Promise<Map<string, { slug: string; displayName: string }>> {
  const map = new Map<string, { slug: string; displayName: string }>();
  if (tenantIds.length === 0) return map;

  const { data, error } = await client
    .from("stores")
    .select("tenant_id, slug, display_name")
    .in("tenant_id", tenantIds);

  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.tenant_id, { slug: row.slug, displayName: row.display_name });
  }
  return map;
}

export type CartWriteResult =
  | { ok: true; cartId: string }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid_quantity" };

/**
 * カートへ入れる。同じ SKU が既にあれば数量を足す。
 *
 * テナントが違えば別のカートになる。どのテナントの商品かは SKU から
 * 引き直す（クライアントから来たテナントIDを信用しない）。
 */
export async function addToCart(
  client: MarketSupabaseClient,
  params: { buyerId: string; variantId: string; quantity: number },
): Promise<CartWriteResult> {
  if (params.quantity < 1 || params.quantity > MAX_ITEM_QUANTITY) {
    return { ok: false, reason: "invalid_quantity" };
  }

  // 公開されている商品の SKU かを RLS に判定させる。読めなければ買えない
  const { data: variant, error } = await client
    .from("product_variants")
    .select("id, product_id, is_active")
    .eq("id", params.variantId)
    .maybeSingle();

  if (error) throw error;
  if (!variant || !variant.is_active) return { ok: false, reason: "unavailable" };

  const { data: product, error: productError } = await client
    .from("products")
    .select("tenant_id")
    .eq("id", variant.product_id)
    .maybeSingle();

  if (productError) throw productError;
  if (!product) return { ok: false, reason: "unavailable" };

  const cartId = await ensureCart(client, params.buyerId, product.tenant_id);

  const { data: existing, error: existingError } = await client
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("variant_id", params.variantId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    // 上限で頭打ちにする。エラーにすると、既に入っている数を
    // 知らない購入者には理由が分からない
    const quantity = Math.min(MAX_ITEM_QUANTITY, existing.quantity + params.quantity);
    const { error: updateError } = await client
      .from("cart_items")
      .update({ quantity })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await client
      .from("cart_items")
      .insert({ cart_id: cartId, variant_id: params.variantId, quantity: params.quantity });
    if (insertError) throw insertError;
  }

  return { ok: true, cartId };
}

/** 購入者×テナントのカートを 1 つに保つ（0003 の一意索引に合わせる） */
async function ensureCart(
  client: MarketSupabaseClient,
  buyerId: string,
  tenantId: string,
): Promise<string> {
  const { data: existing, error } = await client
    .from("carts")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await client
    .from("carts")
    .insert({ buyer_id: buyerId, tenant_id: tenantId })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return created.id;
}

export async function updateCartItem(
  client: MarketSupabaseClient,
  params: { itemId: string; quantity: number },
): Promise<CartWriteResult> {
  if (params.quantity < 1 || params.quantity > MAX_ITEM_QUANTITY) {
    return { ok: false, reason: "invalid_quantity" };
  }

  // RLS（cart_items_self_all）が他人の行を弾く。0 件なら not_found
  const { data, error } = await client
    .from("cart_items")
    .update({ quantity: params.quantity })
    .eq("id", params.itemId)
    .select("cart_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, cartId: data.cart_id };
}

export async function removeCartItem(
  client: MarketSupabaseClient,
  itemId: string,
): Promise<CartWriteResult> {
  const { data, error } = await client
    .from("cart_items")
    .delete()
    .eq("id", itemId)
    .select("cart_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  // 空になったカートは残さない。店舗ごとの見出しだけが並ぶのを避ける
  const { count } = await client
    .from("cart_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", data.cart_id);

  if ((count ?? 0) === 0) {
    await client.from("carts").delete().eq("id", data.cart_id);
  }

  return { ok: true, cartId: data.cart_id };
}
