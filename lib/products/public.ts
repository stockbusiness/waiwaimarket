import "server-only";

import { supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient, type MarketSupabaseClient } from "@/lib/supabase/server";

import {
  availableQuantity,
  isInStock,
  priceRange,
  type PriceRange,
  type VariantForDisplay,
} from "./price";

/**
 * 公開の商品一覧・商品詳細（docs/00 5.1、docs/06 4.1・フェーズ2-4）。
 *
 * 購入者面の anon クライアントで読む。公開してよいかの判定は RLS に任せる
 * （0004 の products_public_read が「承認済み商品かつ承認済みテナント」に
 * 限る）。アプリ側でも status を絞ると判定が 2 か所になり、片方だけ直して
 * 未承認商品が漏れる事故につながる。
 *
 * **埋め込み（PostgREST の `select("...stores(...)")`）を使わない。**
 * products と stores の間に外部キーが無いため（どちらも tenants を指す
 * 兄弟の関係）、埋め込みでは解決できない。テナントIDで引き直して
 * JavaScript 側で突き合わせる。画像・SKU・在庫も同じ形に揃えてある。
 *
 * docs/04 9.1 は GET /api/market/products を挙げているが、一覧も詳細も
 * サーバー側で描画するためブラウザから叩く API は要らない。カートが入る
 * フェーズ3 で必要になった時点で作る。
 */

/** 1 ページの件数。スマートフォンで 2 列、広い画面で 4 列に割り切れる数 */
export const PAGE_SIZE = 24;

export function productImageUrl(storagePath: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/product-images/${storagePath}`;
}

export type ProductListItem = {
  id: string;
  title: string;
  storeSlug: string | null;
  storeName: string | null;
  imageUrl: string | null;
  price: PriceRange | null;
  inStock: boolean;
};

export type ProductListResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export type ProductListQuery = {
  /** カテゴリーの slug */
  category?: string;
  /** キーワード（商品名の部分一致） */
  q?: string;
  /** 店舗の slug */
  store?: string;
  page?: number;
};

const EMPTY: ProductListResult = { items: [], total: 0, page: 1, pageCount: 0 };

/**
 * 商品名の部分一致に使う文字をそのまま渡さない。
 *
 * `ilike` は `%` と `_` をワイルドカードとして解釈する。利用者が `%` と
 * 打つと全件に一致してしまう。検索語は「文字として」扱う。
 *
 * 全文検索の索引（pg_trgm）は入れていない。docs/06 フェーズ6 の想定が
 * 商品 20〜50 点のため。件数が増えたら索引を足す。
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** テナントID → 店舗。店舗ページを持たないテナントの商品もあるので Map で引く */
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

/** 商品ID → 代表画像（並び順の先頭） */
async function loadCoverImages(
  client: MarketSupabaseClient,
  productIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;

  const { data, error } = await client
    .from("product_images")
    .select("product_id, storage_path, sort_order")
    .in("product_id", productIds)
    .order("sort_order");

  if (error) throw error;
  for (const row of data ?? []) {
    // 並び順の昇順で来るので、最初に見つかったものが代表
    if (!map.has(row.product_id)) {
      map.set(row.product_id, productImageUrl(row.storage_path));
    }
  }
  return map;
}

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  option_label: string | null;
  price_incl_tax: number;
  is_active: boolean;
};

/** 商品ID → SKU と在庫 */
async function loadVariants(
  client: MarketSupabaseClient,
  productIds: string[],
): Promise<Map<string, (VariantRow & VariantForDisplay)[]>> {
  const map = new Map<string, (VariantRow & VariantForDisplay)[]>();
  if (productIds.length === 0) return map;

  const { data: variants, error } = await client
    .from("product_variants")
    .select("id, product_id, sku, option_label, price_incl_tax, is_active")
    .in("product_id", productIds)
    .order("sku");

  if (error) throw error;
  const rows = variants ?? [];
  if (rows.length === 0) return map;

  const { data: inventories, error: inventoryError } = await client
    .from("inventories")
    .select("variant_id, quantity, reserved_quantity")
    .in(
      "variant_id",
      rows.map((row) => row.id),
    );

  if (inventoryError) throw inventoryError;

  const stock = new Map(
    (inventories ?? []).map((row) => [
      row.variant_id,
      { quantity: row.quantity, reserved: row.reserved_quantity },
    ]),
  );

  for (const row of rows) {
    const inventory = stock.get(row.id);
    const entry = {
      ...row,
      priceInclTax: row.price_incl_tax,
      isActive: row.is_active,
      quantity: inventory?.quantity ?? 0,
      reservedQuantity: inventory?.reserved ?? 0,
    };
    const list = map.get(row.product_id);
    if (list) list.push(entry);
    else map.set(row.product_id, [entry]);
  }
  return map;
}

export async function listPublicProducts(
  query: ProductListQuery = {},
): Promise<ProductListResult> {
  const supabase = await createSupabaseServerClient("buyer");
  const page = Math.max(1, Math.floor(query.page ?? 1));

  let builder = supabase
    .from("products")
    .select("id, title, tenant_id, created_at", { count: "exact" });

  if (query.category) {
    // カテゴリーは slug で受けるので id に引き直す。見つからなければ
    // 結果を空にする（存在しない slug を無視して全件を出すと、
    // リンク切れに気づけない）
    const { data: category } = await supabase
      .from("product_categories")
      .select("id")
      .eq("slug", query.category)
      .eq("is_active", true)
      .maybeSingle();

    if (!category) return { ...EMPTY, page };
    builder = builder.eq("category_id", category.id);
  }

  if (query.store) {
    const { data: store } = await supabase
      .from("stores")
      .select("tenant_id")
      .eq("slug", query.store)
      .maybeSingle();

    if (!store) return { ...EMPTY, page };
    builder = builder.eq("tenant_id", store.tenant_id);
  }

  const keyword = query.q?.trim();
  if (keyword) {
    builder = builder.ilike("title", `%${escapeLikePattern(keyword)}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await builder
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const rows = data ?? [];
  const total = count ?? 0;

  const [stores, covers, variants] = await Promise.all([
    loadStores(supabase, [...new Set(rows.map((row) => row.tenant_id))]),
    loadCoverImages(supabase, rows.map((row) => row.id)),
    loadVariants(supabase, rows.map((row) => row.id)),
  ]);

  return {
    items: rows.map((row) => {
      const store = stores.get(row.tenant_id);
      const rowVariants = variants.get(row.id) ?? [];
      return {
        id: row.id,
        title: row.title,
        storeSlug: store?.slug ?? null,
        storeName: store?.displayName ?? null,
        imageUrl: covers.get(row.id) ?? null,
        price: priceRange(rowVariants),
        inStock: isInStock(rowVariants),
      };
    }),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type PublicProductDetail = {
  id: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  storeSlug: string | null;
  storeName: string | null;
  images: { id: string; url: string }[];
  variants: {
    id: string;
    sku: string;
    optionLabel: string | null;
    priceInclTax: number;
    inStock: boolean;
  }[];
  price: PriceRange | null;
  inStock: boolean;
};

/**
 * 1 件。公開されていない商品は RLS で読めないので null になり、
 * 呼び出し側が 404 にする。「審査中です」とは出さない（存在を知らせない）。
 */
export async function getPublicProduct(id: string): Promise<PublicProductDetail | null> {
  const supabase = await createSupabaseServerClient("buyer");

  const { data: product, error } = await supabase
    .from("products")
    .select("id, title, description, tenant_id, category_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!product) return null;

  const [stores, variantMap, imageResult, categoryResult] = await Promise.all([
    loadStores(supabase, [product.tenant_id]),
    loadVariants(supabase, [product.id]),
    supabase
      .from("product_images")
      .select("id, storage_path, sort_order")
      .eq("product_id", product.id)
      .order("sort_order"),
    product.category_id
      ? supabase
          .from("product_categories")
          .select("name, slug")
          .eq("id", product.category_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (imageResult.error) throw imageResult.error;

  const store = stores.get(product.tenant_id);
  const variants = variantMap.get(product.id) ?? [];
  const category = categoryResult.data;

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
    storeSlug: store?.slug ?? null,
    storeName: store?.displayName ?? null,
    images: (imageResult.data ?? []).map((image) => ({
      id: image.id,
      url: productImageUrl(image.storage_path),
    })),
    // 販売しない設定の SKU は購入者に見せない
    variants: variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        optionLabel: variant.option_label,
        priceInclTax: variant.price_incl_tax,
        inStock: availableQuantity(variant) > 0,
      })),
    price: priceRange(variants),
    inStock: isInStock(variants),
  };
}

export type PublicCategory = { name: string; slug: string };

/** 絞り込みに出すカテゴリー。0006 の公開ポリシーが有効なものだけを返す */
export async function listPublicCategories(): Promise<PublicCategory[]> {
  const supabase = await createSupabaseServerClient("buyer");
  const { data, error } = await supabase
    .from("product_categories")
    .select("name, slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) {
    // 絞り込みが出ないだけにする。一覧そのものは表示できる
    console.error("カテゴリーの取得に失敗しました", error);
    return [];
  }
  return data ?? [];
}
