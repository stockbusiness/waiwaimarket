import { describe, expect, it } from "vitest";

import {
  calculateOrderAmounts,
  formatYen,
  lineTotal,
  shippingFee,
  subtotalInclTax,
  taxBreakdown,
  type MoneyLine,
} from "@/lib/orders/money";

function line(over: Partial<MoneyLine> = {}): MoneyLine {
  return { unitPriceInclTax: 1000, quantity: 1, taxRate: 0.1, ...over };
}

describe("小計", () => {
  it("単価 × 数量の合計", () => {
    expect(lineTotal(line({ unitPriceInclTax: 2480, quantity: 3 }))).toBe(7440);
    expect(
      subtotalInclTax([
        line({ unitPriceInclTax: 2480, quantity: 3 }),
        line({ unitPriceInclTax: 500, quantity: 2 }),
      ]),
    ).toBe(8440);
  });

  it("空のカートは 0", () => {
    expect(subtotalInclTax([])).toBe(0);
  });
});

describe("送料", () => {
  const rule = { baseFee: 800, freeThreshold: 5000 };

  it("しきい値未満は基本送料", () => {
    expect(shippingFee(rule, 4999)).toBe(800);
  });

  it("しきい値ちょうどで無料", () => {
    // 「5,000円以上で送料無料」と案内するので、ちょうどは無料でなければ
    // 案内と食い違う
    expect(shippingFee(rule, 5000)).toBe(0);
  });

  it("しきい値を超えても無料", () => {
    expect(shippingFee(rule, 100000)).toBe(0);
  });

  it("しきい値が無ければ常に基本送料", () => {
    expect(shippingFee({ baseFee: 800, freeThreshold: null }, 100000)).toBe(800);
  });

  it("基本送料 0 は無料のまま", () => {
    expect(shippingFee({ baseFee: 0, freeThreshold: null }, 0)).toBe(0);
  });
});

describe("税率別の内訳", () => {
  it("10% の内税を切り捨てで出す", () => {
    // 1000 × 10 / 110 = 90.909... → 90
    expect(taxBreakdown([line({ unitPriceInclTax: 1000 })])).toEqual([
      { rate: 0.1, totalInclTax: 1000, tax: 90, totalExclTax: 910 },
    ]);
  });

  it("8% の内税を切り捨てで出す", () => {
    // 1000 × 8 / 108 = 74.07... → 74
    expect(taxBreakdown([line({ unitPriceInclTax: 1000, taxRate: 0.08 })])).toEqual([
      { rate: 0.08, totalInclTax: 1000, tax: 74, totalExclTax: 926 },
    ]);
  });

  it("税率が混ざったら分けて返す。並びは税率の昇順", () => {
    const buckets = taxBreakdown([
      line({ unitPriceInclTax: 1000, taxRate: 0.1 }),
      line({ unitPriceInclTax: 540, taxRate: 0.08 }),
    ]);
    expect(buckets.map((b) => b.rate)).toEqual([0.08, 0.1]);
    expect(buckets[0]).toEqual({
      rate: 0.08,
      totalInclTax: 540,
      tax: 40,
      totalExclTax: 500,
    });
  });

  it("同じ税率の行はまとめてから割り戻す", () => {
    // 行ごとに割り戻して足すと 90 + 90 = 180 になるが、
    // まとめて 2000 × 10 / 110 = 181.8... → 181 が正しい。
    // 税は取引単位で計算する
    const buckets = taxBreakdown([
      line({ unitPriceInclTax: 1000 }),
      line({ unitPriceInclTax: 1000 }),
    ]);
    expect(buckets).toEqual([
      { rate: 0.1, totalInclTax: 2000, tax: 181, totalExclTax: 1819 },
    ]);
  });

  it("浮動小数の誤差で 1 円ずれない", () => {
    // 0.1 も 0.08 も 2 進数で正確に表せない。整数の分数で計算している
    for (const total of [110, 1100, 11000, 3300, 9999, 123456]) {
      const [bucket] = taxBreakdown([line({ unitPriceInclTax: total })]);
      expect(bucket.tax).toBe(Math.floor((total * 10) / 110));
      expect(bucket.tax + bucket.totalExclTax).toBe(total);
    }
  });

  it("送料は含めない（税率が docs で未定義のため）", () => {
    const amounts = calculateOrderAmounts({
      lines: [line({ unitPriceInclTax: 1000 })],
      shipping: { baseFee: 800, freeThreshold: null },
    });
    expect(amounts.taxes).toEqual([
      { rate: 0.1, totalInclTax: 1000, tax: 90, totalExclTax: 910 },
    ]);
  });

  it("空のカートは空の内訳", () => {
    expect(taxBreakdown([])).toEqual([]);
  });

  it("税抜と内税を足すと必ず税込に戻る", () => {
    const buckets = taxBreakdown([
      line({ unitPriceInclTax: 1234, quantity: 7 }),
      line({ unitPriceInclTax: 567, quantity: 3, taxRate: 0.08 }),
    ]);
    for (const bucket of buckets) {
      expect(bucket.totalExclTax + bucket.tax).toBe(bucket.totalInclTax);
    }
  });
});

describe("注文金額一式", () => {
  it("小計 + 送料 − ポイント値引き", () => {
    const amounts = calculateOrderAmounts({
      lines: [line({ unitPriceInclTax: 2480, quantity: 2 })],
      shipping: { baseFee: 800, freeThreshold: 10000 },
    });
    expect(amounts.subtotalInclTax).toBe(4960);
    expect(amounts.shippingFee).toBe(800);
    expect(amounts.pointDiscount).toBe(0);
    expect(amounts.totalCharged).toBe(5760);
  });

  it("送料無料になると合計から落ちる", () => {
    const amounts = calculateOrderAmounts({
      lines: [line({ unitPriceInclTax: 5000 })],
      shipping: { baseFee: 800, freeThreshold: 5000 },
    });
    expect(amounts.shippingFee).toBe(0);
    expect(amounts.totalCharged).toBe(5000);
  });

  it("ポイント値引きを引く（フェーズ4 で使う）", () => {
    const amounts = calculateOrderAmounts({
      lines: [line({ unitPriceInclTax: 3000 })],
      shipping: { baseFee: 0, freeThreshold: null },
      pointDiscount: 500,
    });
    expect(amounts.totalCharged).toBe(2500);
  });

  it("値引きが合計を超えても負にしない", () => {
    const amounts = calculateOrderAmounts({
      lines: [line({ unitPriceInclTax: 100 })],
      shipping: { baseFee: 0, freeThreshold: null },
      pointDiscount: 99999,
    });
    expect(amounts.totalCharged).toBe(0);
  });

  it("空のカートでも落ちない", () => {
    const amounts = calculateOrderAmounts({
      lines: [],
      shipping: { baseFee: 800, freeThreshold: 5000 },
    });
    expect(amounts.subtotalInclTax).toBe(0);
    // 商品が無いのに送料だけ取らない、という判断は呼び出し側（カート画面は
    // 空なら何も出さない）。ここは規則どおり基本送料を返す
    expect(amounts.shippingFee).toBe(800);
    expect(amounts.taxes).toEqual([]);
  });
});

describe("表示", () => {
  it("3 桁区切りにする", () => {
    expect(formatYen(1234567)).toBe("1,234,567円");
    expect(formatYen(0)).toBe("0円");
  });
});
