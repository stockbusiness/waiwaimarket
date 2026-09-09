import { describe, expect, it } from "vitest";

import { legalProfileSchema, storeSchema } from "@/lib/validation/tenant";

const validStore = {
  slug: "waiwai-shop",
  displayName: "わいわい商店",
  description: "紹介文",
  isPublic: true,
};

describe("店舗ページの入力", () => {
  it("正しい値は通る", () => {
    expect(storeSchema.safeParse(validStore).success).toBe(true);
  });

  it("slug は英小文字・数字・ハイフンのみ", () => {
    for (const slug of ["WaiWai", "wai_wai", "wai wai", "わいわい", "-wai", "wai-"]) {
      expect(storeSchema.safeParse({ ...validStore, slug }).success).toBe(false);
    }
  });

  it("slug は 3〜40 文字", () => {
    expect(storeSchema.safeParse({ ...validStore, slug: "ab" }).success).toBe(false);
    expect(storeSchema.safeParse({ ...validStore, slug: "a".repeat(41) }).success).toBe(false);
    expect(storeSchema.safeParse({ ...validStore, slug: "abc" }).success).toBe(true);
  });

  it("公開状態は真偽値で受ける", () => {
    expect(storeSchema.safeParse({ ...validStore, isPublic: "yes" }).success).toBe(false);
  });
});

describe("事業者情報の入力", () => {
  const valid = {
    legalName: "株式会社わいわい",
    representativeName: "田中太郎",
    address: "東京都千代田区1-1-1",
    phone: "03-1234-5678",
    email: "shop@example.com",
  };

  it("店舗表示名は含まない（出店申請とは別の画面のため）", () => {
    const parsed = legalProfileSchema.parse(valid);
    expect("name" in parsed).toBe(false);
  });

  it("出店申請と同じ検証が効く", () => {
    expect(legalProfileSchema.safeParse({ ...valid, email: "bad" }).success).toBe(false);
    expect(
      legalProfileSchema.safeParse({ ...valid, invoiceRegistrationNumber: "X1" }).success,
    ).toBe(false);
  });
});
