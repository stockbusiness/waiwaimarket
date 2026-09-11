import { describe, expect, it } from "vitest";

import {
  categorySchema,
  productBodySchema,
  variantSchema,
  variantsSchema,
} from "@/lib/validation/product";

const validVariant = {
  sku: "SKU-001",
  optionLabel: "Mサイズ",
  priceInclTax: 1980,
  taxRate: 0.1,
  quantity: 10,
  isActive: true,
};

describe("productBodySchema", () => {
  it("カテゴリー未選択（null）を通す。審査に出すときに必須になる", () => {
    const parsed = productBodySchema.parse({
      title: "商品",
      description: "",
      categoryId: null,
    });
    expect(parsed.categoryId).toBeNull();
    expect(parsed.description).toBeUndefined();
  });

  it("表題が空なら拒む", () => {
    expect(
      productBodySchema.safeParse({ title: "  ", description: "", categoryId: null })
        .success,
    ).toBe(false);
  });

  it("カテゴリーは UUID のみ", () => {
    expect(
      productBodySchema.safeParse({ title: "商品", description: "", categoryId: "abc" })
        .success,
    ).toBe(false);
  });
});

describe("variantSchema", () => {
  it("正しい行を通す", () => {
    expect(variantSchema.safeParse(validVariant).success).toBe(true);
  });

  it("SKU の形式を守らせる", () => {
    for (const sku of ["", "ab c", "あ", "-lead", "a".repeat(65)]) {
      expect(variantSchema.safeParse({ ...validVariant, sku }).success).toBe(false);
    }
  });

  it("価格は 0 以上の整数の円。小数と負数を拒む", () => {
    expect(variantSchema.safeParse({ ...validVariant, priceInclTax: 1980.5 }).success).toBe(
      false,
    );
    expect(variantSchema.safeParse({ ...validVariant, priceInclTax: -1 }).success).toBe(
      false,
    );
    expect(variantSchema.safeParse({ ...validVariant, priceInclTax: 0 }).success).toBe(true);
    // フォームからは文字列で届く
    expect(variantSchema.parse({ ...validVariant, priceInclTax: "2500" }).priceInclTax).toBe(
      2500,
    );
  });

  it("税率は 10% と 8% だけ。打ち間違いが請求額に直結するため自由入力にしない", () => {
    expect(variantSchema.safeParse({ ...validVariant, taxRate: 0.08 }).success).toBe(true);
    expect(variantSchema.safeParse({ ...validVariant, taxRate: 0.05 }).success).toBe(false);
    expect(variantSchema.safeParse({ ...validVariant, taxRate: 10 }).success).toBe(false);
  });

  it("在庫数は 0 以上の整数", () => {
    expect(variantSchema.safeParse({ ...validVariant, quantity: -1 }).success).toBe(false);
    expect(variantSchema.safeParse({ ...validVariant, quantity: 1.5 }).success).toBe(false);
  });
});

describe("variantsSchema", () => {
  it("同じ SKU の重複を拒む", () => {
    const rows = [validVariant, { ...validVariant, optionLabel: "L" }];
    expect(variantsSchema.safeParse(rows).success).toBe(false);
  });

  it("SKU が違えば通る", () => {
    const rows = [validVariant, { ...validVariant, sku: "SKU-002" }];
    expect(variantsSchema.safeParse(rows).success).toBe(true);
  });

  it("空の配列を通す（全部消して保存する場合）", () => {
    expect(variantsSchema.safeParse([]).success).toBe(true);
  });
});

describe("categorySchema", () => {
  it("slug は英小文字・数字・ハイフン", () => {
    const base = { name: "服", slug: "apparel", parentId: null, sortOrder: 10, isActive: true };
    expect(categorySchema.safeParse(base).success).toBe(true);
    for (const slug of ["Apparel", "ap parel", "服", "a"]) {
      expect(categorySchema.safeParse({ ...base, slug }).success).toBe(false);
    }
  });
});
