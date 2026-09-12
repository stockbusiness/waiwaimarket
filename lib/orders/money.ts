/**
 * 注文金額の計算（docs/06 フェーズ3-2「送料・税・合計金額のサーバー側再計算」）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * **クライアントから来た金額は一切使わない**（CLAUDE.md 全般ルール）。
 * 受け取るのは SKU と数量だけで、単価は必ず DB から引いた値を渡す。
 *
 * 金額はすべて円の整数。小数で持つと、税・送料・ポイントの配分で端数が
 * 積もって合計が合わなくなる（docs/02 の最大剰余方式も整数前提）。
 */

/** 扱う税率。product_variants.tax_rate と同じ 2 種類（lib/validation/product.ts） */
export type TaxRate = 0.1 | 0.08;

/**
 * 税込価格から内税を割り戻すための分数。
 *
 * 浮動小数で `total * rate / (1 + rate)` と書くと、0.1 も 0.08 も
 * 2 進数で正確に表せないため誤差が出る。整数の分子・分母で計算する。
 */
const TAX_FRACTION: Record<string, { numerator: number; denominator: number }> = {
  "0.1": { numerator: 10, denominator: 110 },
  "0.08": { numerator: 8, denominator: 108 },
};

export type MoneyLine = {
  /** 税込の単価（product_variants.price_incl_tax） */
  unitPriceInclTax: number;
  quantity: number;
  taxRate: TaxRate;
};

export function lineTotal(line: MoneyLine): number {
  return line.unitPriceInclTax * line.quantity;
}

/** 商品代の合計（税込）。orders.subtotal_incl_tax に入る値 */
export function subtotalInclTax(lines: MoneyLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export type ShippingRule = {
  baseFee: number;
  /**
   * この金額以上で送料無料。null なら常に baseFee。
   *
   * 地域別送料（shipping_profiles.region_rules）は使っていない。
   * jsonb の構造が docs で未定義のため、形を決めてから入れる。
   */
  freeThreshold: number | null;
};

/**
 * 送料。境界は「しきい値ちょうどで無料」にする。
 *
 * 「5,000円以上で送料無料」と案内して 5,000円ちょうどが有料だと、
 * 案内と食い違う。
 */
export function shippingFee(rule: ShippingRule, subtotal: number): number {
  if (rule.freeThreshold !== null && subtotal >= rule.freeThreshold) return 0;
  return rule.baseFee;
}

export type TaxBucket = {
  rate: TaxRate;
  /** その税率の税込合計 */
  totalInclTax: number;
  /** 内税（切り捨て） */
  tax: number;
  /** 税抜（税込 − 内税） */
  totalExclTax: number;
};

/**
 * 税率別の内訳。適格請求書に要る「税率別金額」のもと（docs/01）。
 *
 * **端数は切り捨て。** 税込価格から内税を割り戻すときの丸めは docs に
 * 指定が無く、切り捨てで決めた（2026-09-12 に確認）。
 *
 * **送料は含めない。** 送料の税率が docs で未定義のため。領収書を作る
 * フェーズ3-8 までに決める必要がある。いま含めると、決まっていない
 * 前提を数字に埋め込むことになる。
 *
 * 税率の昇順で返す。表示順を呼び出し側ごとに決めさせない。
 */
export function taxBreakdown(lines: MoneyLine[]): TaxBucket[] {
  const byRate = new Map<TaxRate, number>();

  for (const line of lines) {
    byRate.set(line.taxRate, (byRate.get(line.taxRate) ?? 0) + lineTotal(line));
  }

  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, totalInclTax]) => {
      const fraction = TAX_FRACTION[String(rate)];
      const tax = Math.floor((totalInclTax * fraction.numerator) / fraction.denominator);
      return { rate, totalInclTax, tax, totalExclTax: totalInclTax - tax };
    });
}

export type OrderAmounts = {
  subtotalInclTax: number;
  shippingFee: number;
  /** ポイント値引き。フェーズ4 までは 0 */
  pointDiscount: number;
  /** 実際に円で請求する額。orders.total_charged に入る */
  totalCharged: number;
  taxes: TaxBucket[];
};

/**
 * 注文の金額一式。
 *
 * ポイント値引きは 0 のまま置いてある（フェーズ4）。引数に残しておくのは、
 * 後から足すときに合計の式を書き換えずに済ませるため。
 *
 * 0003 に「円決済額は必ず 1 円以上」の制約がある（全額ポイント購入は不可、
 * docs/02 6.1）。ここでは負にならないことだけを保証し、1 円以上の判定は
 * ポイントを入れるフェーズ4 で行う。
 */
export function calculateOrderAmounts(params: {
  lines: MoneyLine[];
  shipping: ShippingRule;
  pointDiscount?: number;
}): OrderAmounts {
  const subtotal = subtotalInclTax(params.lines);
  const shipping = shippingFee(params.shipping, subtotal);
  const pointDiscount = params.pointDiscount ?? 0;

  return {
    subtotalInclTax: subtotal,
    shippingFee: shipping,
    pointDiscount,
    totalCharged: Math.max(0, subtotal + shipping - pointDiscount),
    taxes: taxBreakdown(params.lines),
  };
}

const YEN = new Intl.NumberFormat("ja-JP");

export function formatYen(value: number): string {
  return `${YEN.format(value)}円`;
}
