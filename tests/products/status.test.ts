import { describe, expect, it } from "vitest";

import {
  PRODUCT_REVIEW_ACTIONS,
  PRODUCT_TENANT_ACTIONS,
  bodyChangeResetsReview,
  canReviewTransition,
  canTenantTransition,
  isProductReviewAction,
  isProductTenantAction,
  nextReviewStatus,
  nextTenantStatus,
  reviewRequiresHqAdmin,
  reviewRequiresNote,
  submitBlockers,
} from "@/lib/products/status";
import type { ProductStatus } from "@/lib/supabase/database.types";

const ALL_STATUSES: ProductStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "suspended",
];

describe("テナント側の遷移", () => {
  it("下書きと差し戻しから審査に出せる", () => {
    expect(canTenantTransition("draft", "submit")).toBe(true);
    expect(canTenantTransition("rejected", "submit")).toBe(true);
    expect(nextTenantStatus("submit")).toBe("submitted");
  });

  it("公開中・審査待ち・販売停止からは出し直せない", () => {
    expect(canTenantTransition("submitted", "submit")).toBe(false);
    expect(canTenantTransition("approved", "submit")).toBe(false);
    expect(canTenantTransition("suspended", "submit")).toBe(false);
  });

  it("取り下げられるのは審査待ちだけ", () => {
    expect(canTenantTransition("submitted", "withdraw")).toBe(true);
    for (const status of ALL_STATUSES.filter((s) => s !== "submitted")) {
      expect(canTenantTransition(status, "withdraw")).toBe(false);
    }
    expect(nextTenantStatus("withdraw")).toBe("draft");
  });

  it("テナントは approved / rejected / suspended へ動かせない", () => {
    // 遷移表の行き先に本部だけの状態が混ざっていないこと
    const destinations = PRODUCT_TENANT_ACTIONS.map(nextTenantStatus);
    expect(destinations).not.toContain("approved");
    expect(destinations).not.toContain("rejected");
    expect(destinations).not.toContain("suspended");
  });
});

describe("本部側の遷移", () => {
  it("承認・差戻しは審査待ちからのみ", () => {
    expect(canReviewTransition("submitted", "approve")).toBe(true);
    expect(canReviewTransition("submitted", "reject")).toBe(true);
    expect(canReviewTransition("draft", "approve")).toBe(false);
    expect(canReviewTransition("rejected", "approve")).toBe(false);
  });

  it("販売停止は公開中からのみ、復帰は停止中からのみ", () => {
    expect(canReviewTransition("approved", "suspend")).toBe(true);
    expect(canReviewTransition("submitted", "suspend")).toBe(false);
    expect(canReviewTransition("suspended", "reinstate")).toBe(true);
    expect(canReviewTransition("approved", "reinstate")).toBe(false);
  });

  it("停止と復帰は本部管理者のみ。審査そのものはオペレーターでもよい", () => {
    expect(reviewRequiresHqAdmin("suspend")).toBe(true);
    expect(reviewRequiresHqAdmin("reinstate")).toBe(true);
    expect(reviewRequiresHqAdmin("approve")).toBe(false);
    expect(reviewRequiresHqAdmin("reject")).toBe(false);
  });

  it("行き先がすべて定義されている", () => {
    for (const action of PRODUCT_REVIEW_ACTIONS) {
      expect(ALL_STATUSES).toContain(nextReviewStatus(action));
    }
  });

  it("差戻しと販売停止には理由が要る", () => {
    // 理由を書かずに差し戻すと、テナントは何を直せばよいか分からない
    expect(reviewRequiresNote("reject")).toBe(true);
    expect(reviewRequiresNote("suspend")).toBe(true);
    expect(reviewRequiresNote("approve")).toBe(false);
    expect(reviewRequiresNote("reinstate")).toBe(false);
  });
});

describe("操作名の判定", () => {
  it("知らない文字列を受け付けない", () => {
    expect(isProductTenantAction("submit")).toBe(true);
    expect(isProductTenantAction("approve")).toBe(false);
    expect(isProductReviewAction("approve")).toBe(true);
    expect(isProductReviewAction("submit")).toBe(false);
    expect(isProductReviewAction("")).toBe(false);
  });
});

describe("本文の変更で審査に戻す", () => {
  it("公開中だけ戻す", () => {
    expect(bodyChangeResetsReview("approved")).toBe(true);
    for (const status of ALL_STATUSES.filter((s) => s !== "approved")) {
      expect(bodyChangeResetsReview(status)).toBe(false);
    }
  });
});

describe("審査に出せない理由", () => {
  it("SKU・画像・カテゴリーが揃っていれば空", () => {
    expect(submitBlockers({ variantCount: 1, imageCount: 1, hasCategory: true })).toEqual(
      [],
    );
  });

  it("足りないものを全部返す（1 つ直すたびに出し直させない）", () => {
    const blockers = submitBlockers({
      variantCount: 0,
      imageCount: 0,
      hasCategory: false,
    });
    expect(blockers).toHaveLength(3);
    expect(blockers.join()).toContain("SKU");
    expect(blockers.join()).toContain("画像");
    expect(blockers.join()).toContain("カテゴリー");
  });
});
