import "server-only";

import type { ProductStatus } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";
import type { ProductBodyInput, VariantInput } from "@/lib/validation/product";

import { isOwnImagePath } from "./image-path";
import { bodyChangeResetsReview } from "./status";

/**
 * テナント側の商品操作（docs/06 フェーズ2-1）。
 *
 * 受け取るのは呼び出し元のセッションのクライアント。service_role は使わない。
 * 0004 の products_tenant_* と 0010 の inventories_tenant_* が効くので、
 * API 側の認可（requireTenantMember）と RLS の二重になる（docs/00 8.2）。
 *
 * 審査列（status の approved/rejected・reviewed_*・review_note）はここから
 * 触らない。0010 のトリガが例外で拒否する。
 */

/** 一意制約の違反（SKU の重複など） */
const UNIQUE_VIOLATION = "23505";
/** 外部キーの違反（注文やカートから参照されている SKU の削除） */
const FOREIGN_KEY_VIOLATION = "23503";

export type ProductSummary = {
  id: string;
  title: string;
  status: ProductStatus;
  updatedAt: string;
  variantCount: number;
  imageCount: number;
};

export type ProductDetail = {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  status: ProductStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  variants: {
    id: string;
    sku: string;
    optionLabel: string | null;
    priceInclTax: number;
    taxRate: number;
    isActive: boolean;
    quantity: number;
    reservedQuantity: number;
  }[];
  images: { id: string; storagePath: string; sortOrder: number }[];
};

export type SaveResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "sku_taken" | "in_use" | "invalid_transition" | "conflict";
    };

export async function listProducts(
  client: MarketSupabaseClient,
  tenantId: string,
): Promise<ProductSummary[]> {
  const { data, error } = await client
    .from("products")
    .select("id, title, status, updated_at, product_variants(id), product_images(id)")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updated_at,
    variantCount: row.product_variants?.length ?? 0,
    imageCount: row.product_images?.length ?? 0,
  }));
}

export async function getProduct(
  client: MarketSupabaseClient,
  productId: string,
): Promise<ProductDetail | null> {
  const { data: product, error } = await client
    .from("products")
    .select(
      "id, tenant_id, title, description, category_id, status, review_note, reviewed_at",
    )
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) return null;

  const { data: variants, error: variantError } = await client
    .from("product_variants")
    .select("id, sku, option_label, price_incl_tax, tax_rate, is_active, inventories(quantity, reserved_quantity)")
    .eq("product_id", productId)
    .order("sku");

  if (variantError) throw variantError;

  const { data: images, error: imageError } = await client
    .from("product_images")
    .select("id, storage_path, sort_order")
    .eq("product_id", productId)
    .order("sort_order");

  if (imageError) throw imageError;

  return {
    id: product.id,
    tenantId: product.tenant_id,
    title: product.title,
    description: product.description,
    categoryId: product.category_id,
    status: product.status,
    reviewNote: product.review_note,
    reviewedAt: product.reviewed_at,
    variants: (variants ?? []).map((row) => {
      // 埋め込みは 1 対 1 でも配列で返ることがある。どちらでも拾う
      const inventory = Array.isArray(row.inventories) ? row.inventories[0] : row.inventories;
      return {
        id: row.id,
        sku: row.sku,
        optionLabel: row.option_label,
        priceInclTax: row.price_incl_tax,
        taxRate: Number(row.tax_rate),
        isActive: row.is_active,
        quantity: inventory?.quantity ?? 0,
        reservedQuantity: inventory?.reserved_quantity ?? 0,
      };
    }),
    images: (images ?? []).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      sortOrder: row.sort_order,
    })),
  };
}

export async function createProduct(
  client: MarketSupabaseClient,
  params: { tenantId: string; input: ProductBodyInput },
): Promise<{ ok: true; id: string } | { ok: false; reason: "not_found" }> {
  const { data, error } = await client
    .from("products")
    .insert({
      tenant_id: params.tenantId,
      title: params.input.title,
      description: params.input.description ?? null,
      category_id: params.input.categoryId,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, id: data.id };
}

/**
 * 本文の更新。公開中の商品を直したら審査待ちへ戻す。
 *
 * 戻さないと、きれいな内容で承認を取ってから中身を差し替えられる
 * （docs/05「未承認商品は公開されない」を素通りする経路）。
 */
export async function updateProductBody(
  client: MarketSupabaseClient,
  params: { productId: string; status: ProductStatus; input: ProductBodyInput },
): Promise<SaveResult & { resetToReview?: boolean }> {
  const resetToReview = bodyChangeResetsReview(params.status);

  const { data, error } = await client
    .from("products")
    .update({
      title: params.input.title,
      description: params.input.description ?? null,
      category_id: params.input.categoryId,
      ...(resetToReview ? { status: "submitted" as const } : {}),
    })
    .eq("id", params.productId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, resetToReview };
}

/**
 * SKU の一括保存。送られてこなかった既存行は削除する。
 *
 * 行ごとの追加・削除 API にしないのは、価格と在庫が 1 画面で編集されるため。
 * 個別 API にすると、途中で失敗したときに画面と DB がずれる。
 *
 * 在庫数は inventories 側に持つ（0001）。引当数はここから触らない。
 * 0010 のトリガがサーバー処理以外の変更を拒否する。
 */
export async function saveVariants(
  client: MarketSupabaseClient,
  params: { productId: string; rows: VariantInput[] },
): Promise<SaveResult> {
  const { data: existing, error: existingError } = await client
    .from("product_variants")
    .select("id")
    .eq("product_id", params.productId);

  if (existingError) throw existingError;

  const keptIds = new Set(params.rows.map((row) => row.id).filter(Boolean) as string[]);
  const removedIds = (existing ?? []).map((row) => row.id).filter((id) => !keptIds.has(id));

  if (removedIds.length > 0) {
    const { error } = await client.from("product_variants").delete().in("id", removedIds);
    if (error) {
      // 注文やカートから参照されている SKU は消せない。
      // 消せてしまうと、注文明細がどの商品だったか分からなくなる
      if (error.code === FOREIGN_KEY_VIOLATION) return { ok: false, reason: "in_use" };
      throw error;
    }
  }

  for (const row of params.rows) {
    // product_id は更新側の型に持たせていない。SKU を別の商品へ
    // 付け替えられると、注文明細とのつながりが切れる
    const values = {
      sku: row.sku,
      option_label: row.optionLabel ?? null,
      price_incl_tax: row.priceInclTax,
      tax_rate: row.taxRate,
      is_active: row.isActive,
    };

    const { data: saved, error } = row.id
      ? await client
          .from("product_variants")
          .update(values)
          .eq("id", row.id)
          .eq("product_id", params.productId)
          .select("id")
          .maybeSingle()
      : await client
          .from("product_variants")
          .insert({ product_id: params.productId, ...values })
          .select("id")
          .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "sku_taken" };
      throw error;
    }
    if (!saved) return { ok: false, reason: "not_found" };

    // 在庫行は SKU と 1 対 1。無ければ作り、あれば数量だけ直す
    const { error: inventoryError } = await client
      .from("inventories")
      .upsert({ variant_id: saved.id, quantity: row.quantity }, { onConflict: "variant_id" });
    if (inventoryError) throw inventoryError;
  }

  return { ok: true };
}

/**
 * アップロード済みの画像を商品に結びつける。
 *
 * パスの検証がここの要点（判定は lib/products/image-path.ts）。
 * Storage のポリシー（0008）は先頭フォルダが自テナントであることしか
 * 見ないため、別の商品のフォルダを指す行を作れてしまう。
 */
export async function registerImage(
  client: MarketSupabaseClient,
  params: { productId: string; tenantId: string; storagePath: string },
): Promise<SaveResult & { id?: string }> {
  if (!isOwnImagePath(params.storagePath, params.tenantId, params.productId)) {
    return { ok: false, reason: "not_found" };
  }

  const { data: existing, error: existingError } = await client
    .from("product_images")
    .select("sort_order")
    .eq("product_id", params.productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const { data, error } = await client
    .from("product_images")
    .insert({
      product_id: params.productId,
      storage_path: params.storagePath,
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) {
    // 並び順の一意索引（0010）。同時に 2 枚上げると起きる。やり直せば通る
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
    throw error;
  }
  return { ok: true, id: data.id };
}

export async function deleteImage(
  client: MarketSupabaseClient,
  params: { productId: string; imageId: string },
): Promise<SaveResult & { storagePath?: string }> {
  const { data, error } = await client
    .from("product_images")
    .delete()
    .eq("id", params.imageId)
    .eq("product_id", params.productId)
    .select("storage_path")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, storagePath: data.storage_path };
}

/** 審査への提出と取り下げ。承認・差戻しは本部（lib/products/review.ts） */
export async function setProductStatus(
  client: MarketSupabaseClient,
  params: { productId: string; to: ProductStatus },
): Promise<SaveResult> {
  const { data, error } = await client
    .from("products")
    .update({ status: params.to })
    .eq("id", params.productId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true };
}
