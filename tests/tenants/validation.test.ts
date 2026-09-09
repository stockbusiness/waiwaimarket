import { describe, expect, it } from "vitest";

import { tenantApplicationSchema, tenantReviewSchema } from "@/lib/validation/tenant";

const valid = {
  name: "わいわい商店",
  legalName: "株式会社わいわい",
  representativeName: "田中太郎",
  address: "東京都千代田区1-1-1",
  phone: "03-1234-5678",
  email: "shop@example.com",
};

describe("出店申請の入力", () => {
  it("必須項目が揃えば通る", () => {
    expect(tenantApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it("前後の空白を落とす", () => {
    const parsed = tenantApplicationSchema.parse({ ...valid, name: "  わいわい商店  " });
    expect(parsed.name).toBe("わいわい商店");
  });

  it("空白だけの必須項目は拒否する", () => {
    expect(tenantApplicationSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("メールアドレスの形式を見る", () => {
    expect(tenantApplicationSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(
      false,
    );
  });

  it("電話番号に文字を混ぜない", () => {
    expect(tenantApplicationSchema.safeParse({ ...valid, phone: "03-1234-ABCD" }).success).toBe(
      false,
    );
  });

  it("登録番号は T + 13 桁", () => {
    expect(
      tenantApplicationSchema.safeParse({
        ...valid,
        invoiceRegistrationNumber: "T1234567890123",
      }).success,
    ).toBe(true);
    expect(
      tenantApplicationSchema.safeParse({ ...valid, invoiceRegistrationNumber: "1234567890123" })
        .success,
    ).toBe(false);
  });

  it("登録番号は未取得なら空欄でよい", () => {
    const parsed = tenantApplicationSchema.parse({ ...valid, invoiceRegistrationNumber: "" });
    expect(parsed.invoiceRegistrationNumber).toBeUndefined();
  });
});

describe("審査操作の入力", () => {
  it("既知の操作だけ通す", () => {
    expect(tenantReviewSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(tenantReviewSchema.safeParse({ action: "destroy" }).success).toBe(false);
  });

  it("理由は任意", () => {
    expect(tenantReviewSchema.parse({ action: "reject", reason: "書類不備" }).reason).toBe(
      "書類不備",
    );
  });
});
