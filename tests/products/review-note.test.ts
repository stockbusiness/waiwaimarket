import { describe, expect, it } from "vitest";

import { productReviewSchema } from "@/lib/validation/product";

/**
 * 本部の審査入力。
 *
 * 「理由が必須か」の判定は lib/products/review.ts の requiresNote() に
 * 置いてある（server-only なのでここからは import できない）。ここでは
 * スキーマ側の責任範囲だけを見る。
 */

describe("productReviewSchema", () => {
  it("4 つの操作だけを受け付ける", () => {
    for (const action of ["approve", "reject", "suspend", "reinstate"]) {
      expect(productReviewSchema.safeParse({ action }).success).toBe(true);
    }
    // テナント側の操作を本部の経路へ送れないこと
    for (const action of ["submit", "withdraw", "", "delete"]) {
      expect(productReviewSchema.safeParse({ action }).success).toBe(false);
    }
  });

  it("理由は省略できる（必須かどうかは操作で決まる）", () => {
    const parsed = productReviewSchema.parse({ action: "approve" });
    expect(parsed.note).toBeUndefined();
  });

  it("空白だけの理由は undefined にする。空文字を DB へ入れない", () => {
    expect(productReviewSchema.parse({ action: "reject", note: "   " }).note).toBeUndefined();
  });

  it("理由の前後の空白を落とす", () => {
    expect(productReviewSchema.parse({ action: "reject", note: "  理由  " }).note).toBe(
      "理由",
    );
  });

  it("長すぎる理由を拒む", () => {
    expect(
      productReviewSchema.safeParse({ action: "reject", note: "あ".repeat(1001) }).success,
    ).toBe(false);
  });
});
