import type { ProductStatus } from "@/lib/supabase/database.types";

/**
 * 商品の状態遷移（docs/00 5.3、docs/06 フェーズ2-2、
 * docs/05「未承認商品は公開されない」）。
 * IO を持たない判定だけを置く。実行は lib/products/manage.ts と review.ts。
 */

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "下書き",
  submitted: "審査待ち",
  approved: "公開中",
  rejected: "差し戻し",
  suspended: "販売停止",
};

/** テナント側の操作 */
export const PRODUCT_TENANT_ACTIONS = ["submit", "withdraw"] as const;
export type ProductTenantAction = (typeof PRODUCT_TENANT_ACTIONS)[number];

/** 本部側の操作 */
export const PRODUCT_REVIEW_ACTIONS = ["approve", "reject", "suspend", "reinstate"] as const;
export type ProductReviewAction = (typeof PRODUCT_REVIEW_ACTIONS)[number];

const TENANT_TRANSITIONS: Record<
  ProductTenantAction,
  { from: ProductStatus[]; to: ProductStatus }
> = {
  // 差し戻された商品も直して出し直せる
  submit: { from: ["draft", "rejected"], to: "submitted" },
  // 審査に出したあと、間違いに気づいて取り下げる
  withdraw: { from: ["submitted"], to: "draft" },
};

const REVIEW_TRANSITIONS: Record<
  ProductReviewAction,
  { from: ProductStatus[]; to: ProductStatus }
> = {
  approve: { from: ["submitted"], to: "approved" },
  reject: { from: ["submitted"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "approved" },
};

export function isProductTenantAction(value: string): value is ProductTenantAction {
  return (PRODUCT_TENANT_ACTIONS as readonly string[]).includes(value);
}

export function isProductReviewAction(value: string): value is ProductReviewAction {
  return (PRODUCT_REVIEW_ACTIONS as readonly string[]).includes(value);
}

export function canTenantTransition(
  from: ProductStatus,
  action: ProductTenantAction,
): boolean {
  return TENANT_TRANSITIONS[action].from.includes(from);
}

export function nextTenantStatus(action: ProductTenantAction): ProductStatus {
  return TENANT_TRANSITIONS[action].to;
}

export function canReviewTransition(
  from: ProductStatus,
  action: ProductReviewAction,
): boolean {
  return REVIEW_TRANSITIONS[action].from.includes(from);
}

export function nextReviewStatus(action: ProductReviewAction): ProductStatus {
  return REVIEW_TRANSITIONS[action].to;
}

/**
 * 販売停止と復帰は本部管理者のみ。承認・差戻しはオペレーターでも行える。
 * テナント審査（lib/tenants/status.ts の requiresHqAdmin）と揃えてある。
 */
export function reviewRequiresHqAdmin(action: ProductReviewAction): boolean {
  return action === "suspend" || action === "reinstate";
}

/**
 * 差戻しと販売停止は理由が要る。
 *
 * 理由を書かずに差し戻すと、テナントは何を直せばよいか分からないまま
 * 出し直すことになり、審査が何度も往復する。承認と再開は任意
 * （補足があれば残す）。
 */
export function reviewRequiresNote(action: ProductReviewAction): boolean {
  return action === "reject" || action === "suspend";
}

/**
 * 本文（表題・説明・カテゴリー・画像）を直したら審査をやり直す。
 *
 * 公開中の商品の本文を自由に書き換えられると、きれいな内容で承認を取って
 * から中身を差し替えられる。docs/05「未承認商品は公開されない」を
 * 素通りする経路になるため、本文の変更は審査待ちへ戻す。
 *
 * 価格・在庫・SKU は戻さない。値段と在庫は日常的に動くもので、
 * そのたびに公開が止まると店が回らない。
 */
export function bodyChangeResetsReview(status: ProductStatus): boolean {
  return status === "approved";
}

/** 審査に出せる状態か（画面の説明文にも使う） */
export function submitBlockers(input: {
  variantCount: number;
  imageCount: number;
  hasCategory: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.variantCount === 0) {
    blockers.push("SKU（価格と在庫）が 1 つも登録されていません");
  }
  if (input.imageCount === 0) {
    blockers.push("商品画像が 1 枚も登録されていません");
  }
  if (!input.hasCategory) {
    blockers.push("カテゴリーが選択されていません");
  }
  return blockers;
}
