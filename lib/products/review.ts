import "server-only";

import { recordAudit } from "@/lib/audit/log";
import type { HqRole, ProductStatus } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

import {
  canReviewTransition,
  nextReviewStatus,
  reviewRequiresNote,
  type ProductReviewAction,
} from "./status";

/**
 * 本部の商品審査（docs/00 5.3、docs/06 フェーズ2-2、
 * docs/05「未承認商品は公開されない」）。
 *
 * 本部のセッションのまま書く。0004 の hq_write_products が本部オペレーター
 * 以上に書き込みを許し、0010 のトリガも is_hq_operator() を通すため、
 * service_role は要らない。使うと RLS 側が素通りになり、ポリシーの誤りに
 * 気づけなくなる（docs/00 8.2「RLS だけに依存しない」の裏返し）。
 *
 * 状態遷移の判定は lib/products/status.ts（IO なし）に置き、ここは実行に徹する。
 */

export type ReviewResult =
  | { ok: true; status: ProductStatus }
  | { ok: false; reason: "not_found" | "invalid_transition" | "note_required" };

export async function reviewProduct(
  client: MarketSupabaseClient,
  params: {
    productId: string;
    action: ProductReviewAction;
    actorId: string;
    actorRole: HqRole;
    note?: string;
    ip: string | null;
  },
): Promise<ReviewResult> {
  if (reviewRequiresNote(params.action) && !params.note?.trim()) {
    return { ok: false, reason: "note_required" };
  }

  const { data: product, error } = await client
    .from("products")
    .select("id, tenant_id, title, status")
    .eq("id", params.productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) return { ok: false, reason: "not_found" };

  if (!canReviewTransition(product.status, params.action)) {
    return { ok: false, reason: "invalid_transition" };
  }

  const to = nextReviewStatus(params.action);
  const note = params.note?.trim() || null;

  const { data: updated, error: updateError } = await client
    .from("products")
    .update({
      status: to,
      reviewed_by: params.actorId,
      reviewed_at: new Date().toISOString(),
      // 復帰のときは差戻し・停止の理由を消す。残すとテナントの画面に
      // 解決済みの警告が出たままになる
      review_note: params.action === "reinstate" ? null : note,
    })
    .eq("id", params.productId)
    // 読んでから書くまでに状態が変わっていたら書かない。
    // 2 人の担当者が同時に開いていると、片方の判断が消える
    .eq("status", product.status)
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) return { ok: false, reason: "invalid_transition" };

  await recordAudit({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: `product.${params.action}`,
    targetTable: "products",
    targetId: params.productId,
    detail: {
      tenant_id: product.tenant_id,
      title: product.title,
      from: product.status,
      to,
      // 理由は監査ログにも残す。products.review_note は次の審査で
      // 上書きされるが、監査ログは追記のみで消えない
      note,
    },
    ip: params.ip,
  });

  return { ok: true, status: to };
}

export type ReviewQueueItem = {
  id: string;
  title: string;
  tenantId: string;
  tenantName: string;
  status: ProductStatus;
  updatedAt: string;
  variantCount: number;
  imageCount: number;
};

/**
 * 審査待ちを先に、古いものから並べる。
 *
 * 本部が最初に見るのは「自分が判断すべきもの」なので、既定は submitted のみ。
 * 状態を指定すれば公開中や販売停止も追える。
 */
export async function listProductsForReview(
  client: MarketSupabaseClient,
  status: ProductStatus | "all" = "submitted",
): Promise<ReviewQueueItem[]> {
  let query = client
    .from("products")
    .select(
      "id, title, tenant_id, status, updated_at, tenants(name), product_variants(id), product_images(id)",
    );

  if (status !== "all") {
    query = query.eq("status", status);
  }

  // 審査待ちは古い順（待たせている順）。それ以外は新しい順
  const { data, error } = await query.order("updated_at", {
    ascending: status === "submitted",
  });

  if (error) throw error;

  return (data ?? []).map((row) => {
    // 埋め込みは 1 対 1 でも配列で返ることがある。どちらでも拾う
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      id: row.id,
      title: row.title,
      tenantId: row.tenant_id,
      tenantName: tenant?.name ?? "（不明）",
      status: row.status,
      updatedAt: row.updated_at,
      variantCount: row.product_variants?.length ?? 0,
      imageCount: row.product_images?.length ?? 0,
    };
  });
}

export type ReviewDetail = {
  id: string;
  title: string;
  description: string | null;
  status: ProductStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  categoryName: string | null;
  variants: {
    id: string;
    sku: string;
    optionLabel: string | null;
    priceInclTax: number;
    taxRate: number;
    isActive: boolean;
    quantity: number;
  }[];
  images: { id: string; storagePath: string }[];
};

export async function getProductForReview(
  client: MarketSupabaseClient,
  productId: string,
): Promise<ReviewDetail | null> {
  const { data: product, error } = await client
    .from("products")
    .select(
      "id, title, description, status, review_note, reviewed_at, tenant_id, category_id, tenants(name, status), product_categories(name)",
    )
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) return null;

  const tenant = Array.isArray(product.tenants) ? product.tenants[0] : product.tenants;
  const category = Array.isArray(product.product_categories)
    ? product.product_categories[0]
    : product.product_categories;

  const { data: variants, error: variantError } = await client
    .from("product_variants")
    .select("id, sku, option_label, price_incl_tax, tax_rate, is_active, inventories(quantity)")
    .eq("product_id", productId)
    .order("sku");

  if (variantError) throw variantError;

  const { data: images, error: imageError } = await client
    .from("product_images")
    .select("id, storage_path")
    .eq("product_id", productId)
    .order("sort_order");

  if (imageError) throw imageError;

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    status: product.status,
    reviewNote: product.review_note,
    reviewedAt: product.reviewed_at,
    tenantId: product.tenant_id,
    tenantName: tenant?.name ?? "（不明）",
    tenantStatus: tenant?.status ?? "unknown",
    categoryName: category?.name ?? null,
    variants: (variants ?? []).map((row) => {
      const inventory = Array.isArray(row.inventories) ? row.inventories[0] : row.inventories;
      return {
        id: row.id,
        sku: row.sku,
        optionLabel: row.option_label,
        priceInclTax: row.price_incl_tax,
        taxRate: Number(row.tax_rate),
        isActive: row.is_active,
        quantity: inventory?.quantity ?? 0,
      };
    }),
    images: (images ?? []).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
    })),
  };
}
