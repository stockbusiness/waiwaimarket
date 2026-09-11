import { describe, expect, it } from "vitest";

import {
  availableQuantity,
  formatPriceRange,
  formatYen,
  isInStock,
  priceRange,
  type VariantForDisplay,
} from "@/lib/products/price";

function variant(over: Partial<VariantForDisplay> = {}): VariantForDisplay {
  return {
    priceInclTax: 1000,
    isActive: true,
    quantity: 5,
    reservedQuantity: 0,
    ...over,
  };
}

describe("priceRange", () => {
  it("販売中の SKU だけで幅を出す", () => {
    // 販売しない設定の 9999 円は無視する
    const range = priceRange([
      variant({ priceInclTax: 2480 }),
      variant({ priceInclTax: 2980 }),
      variant({ priceInclTax: 9999, isActive: false }),
    ]);
    expect(range).toEqual({ min: 2480, max: 2980, hasRange: true });
  });

  it("価格が 1 つなら幅なし", () => {
    expect(priceRange([variant({ priceInclTax: 500 })])).toEqual({
      min: 500,
      max: 500,
      hasRange: false,
    });
  });

  it("在庫切れの SKU も価格には含める", () => {
    // 売り切れでも「いくらの商品か」は見せる。在庫が戻ったときに
    // 表示価格が変わると不審に見える
    const range = priceRange([
      variant({ priceInclTax: 800, quantity: 0 }),
      variant({ priceInclTax: 1200 }),
    ]);
    expect(range).toEqual({ min: 800, max: 1200, hasRange: true });
  });

  it("販売中の SKU が無ければ null", () => {
    expect(priceRange([])).toBeNull();
    expect(priceRange([variant({ isActive: false })])).toBeNull();
  });

  it("0 円を価格なしと取り違えない", () => {
    expect(priceRange([variant({ priceInclTax: 0 })])).toEqual({
      min: 0,
      max: 0,
      hasRange: false,
    });
  });
});

describe("availableQuantity", () => {
  it("引当済みを引く", () => {
    // 引当は購入手続き中の 15 分間押さえられている数。引かないと
    // 既に押さえられた在庫を「在庫あり」と見せてしまう
    expect(availableQuantity(variant({ quantity: 10, reservedQuantity: 3 }))).toBe(7);
  });

  it("引当が在庫を超えても負の数にしない", () => {
    expect(availableQuantity(variant({ quantity: 2, reservedQuantity: 5 }))).toBe(0);
  });
});

describe("isInStock", () => {
  it("買える SKU が 1 つでもあれば在庫あり", () => {
    expect(
      isInStock([variant({ quantity: 0 }), variant({ quantity: 1 })]),
    ).toBe(true);
  });

  it("全部売り切れなら在庫なし", () => {
    expect(isInStock([variant({ quantity: 0 }), variant({ quantity: 0 })])).toBe(false);
  });

  it("在庫があっても販売しない設定なら在庫なし", () => {
    expect(isInStock([variant({ quantity: 99, isActive: false })])).toBe(false);
  });

  it("全部引当済みなら在庫なし", () => {
    expect(isInStock([variant({ quantity: 3, reservedQuantity: 3 })])).toBe(false);
  });

  it("SKU が無ければ在庫なし", () => {
    expect(isInStock([])).toBe(false);
  });
});

describe("表示", () => {
  it("3 桁区切りにする", () => {
    expect(formatYen(1234567)).toBe("1,234,567円");
    expect(formatYen(0)).toBe("0円");
  });

  it("幅があれば 〜 を付ける", () => {
    expect(formatPriceRange({ min: 1000, max: 2000, hasRange: true })).toBe("1,000円〜");
    expect(formatPriceRange({ min: 1000, max: 1000, hasRange: false })).toBe("1,000円");
  });

  it("価格が無い商品は「価格未設定」", () => {
    expect(formatPriceRange(null)).toBe("価格未設定");
  });
});
