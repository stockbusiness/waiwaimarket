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

import { type RegionRules, feeRange, regionFee } from "@/lib/shipping/region";

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

/**
 * 送料の消費税率は 10% で固定する（docs/01）。
 *
 * **テナントが選べる値ではない。** 送料を別建てで請求する場合、送料は
 * 運送役務の対価であって飲食料品の譲渡の対価ではないため、軽減税率の
 * 対象にならない（国税庁「消費税の軽減税率制度に関するQ&A（個別事例編）」
 * 問39）。8% の商品だけのカートでも、別建ての送料は 10% になる。
 *
 * 「送料込み価格」で売りたいテナントは送料を 0 円に設定して商品価格へ
 * 含める。その場合は商品の税率（食品なら 8%）がそのまま適用され、
 * 上の Q&A の例外にも結果として合う。設定項目を増やさずに両方書ける。
 */
export const SHIPPING_TAX_RATE: TaxRate = 0.1;

export type ShippingRule = {
  baseFee: number;
  /**
   * この金額以上で送料無料。null なら常に baseFee。
   *
   * **地域別送料より優先する。** しきい値を超えたら地域別も 0 円
   * （lib/shipping/region.ts）。
   */
  freeThreshold: number | null;
  /** 地域別送料。既定は `EMPTY_REGION_RULES`（地域別なし） */
  regionRules: RegionRules;
};

/**
 * 送料。境界は「しきい値ちょうどで無料」にする。
 *
 * 「5,000円以上で送料無料」と案内して 5,000円ちょうどが有料だと、
 * 案内と食い違う。
 *
 * **届け先が未指定なら範囲の下限を返す。** カートには配送先がまだ無い。
 * 上限を出すと実際より高く見え、下限を出すと安く見えるが、下限に
 * 「〜円から」を添えるほうが誤解が小さい。確定は購入手続きの住所入力後で、
 * そこでは必ず `prefectureCode` を渡すこと。
 */
export function shippingFee(
  rule: ShippingRule,
  subtotal: number,
  prefectureCode?: string | null,
): number {
  if (rule.freeThreshold !== null && subtotal >= rule.freeThreshold) return 0;
  if (prefectureCode) return regionFee(rule.regionRules, rule.baseFee, prefectureCode);
  return feeRange(rule.regionRules, rule.baseFee).min;
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
 * **送料も含める。** 別建ての送料は 10%（`SHIPPING_TAX_RATE`）の側へ足す。
 * 8% の商品だけのカートでも 10% の欄が立つのは、税率が商品ではなく
 * 「運送役務」に対して決まるため（docs/01）。
 *
 * 送料は商品と合算してから割り戻す。1,000 円の商品（10%）と 800 円の送料を
 * 別々に割り戻すと 90 + 72 = 162 だが、まとめると 1,800 × 10 / 110 = 163。
 * 行ごとに割らないのと同じ理由で、税は取引単位で計算する。
 *
 * 税率の昇順で返す。表示順を呼び出し側ごとに決めさせない。
 */
export function taxBreakdown(lines: MoneyLine[], shipping = 0): TaxBucket[] {
  const byRate = new Map<TaxRate, number>();

  for (const line of lines) {
    byRate.set(line.taxRate, (byRate.get(line.taxRate) ?? 0) + lineTotal(line));
  }

  // 0 円の送料で 10% の欄を立てない。送料無料の注文に「消費税 0円」の
  // 行だけが出るのを避ける
  if (shipping > 0) {
    byRate.set(SHIPPING_TAX_RATE, (byRate.get(SHIPPING_TAX_RATE) ?? 0) + shipping);
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
  /**
   * 届け先がまだ決まっておらず、届け先によって送料が変わる。
   * このとき `shippingFee` は下限で、`totalCharged` も下限になる。
   * 画面では「〜円から」と出し、確定していないことを示すこと。
   */
  shippingVaries: boolean;
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
  /** 届け先の都道府県コード（JIS X 0401）。未指定なら送料は下限 */
  prefectureCode?: string | null;
  pointDiscount?: number;
}): OrderAmounts {
  const subtotal = subtotalInclTax(params.lines);
  const shipping = shippingFee(params.shipping, subtotal, params.prefectureCode);
  const pointDiscount = params.pointDiscount ?? 0;

  // しきい値で無料になっているなら、届け先が決まっても金額は動かない。
  // 「送料が 0 円だから動かない」と書くと間違う。基本送料 0 円で沖縄だけ
  // 1,500 円という設定では下限が 0 円になり、無料なのに動く場合がある
  const freeByThreshold =
    params.shipping.freeThreshold !== null && subtotal >= params.shipping.freeThreshold;
  const varies =
    !params.prefectureCode &&
    !freeByThreshold &&
    feeRange(params.shipping.regionRules, params.shipping.baseFee).varies;

  return {
    subtotalInclTax: subtotal,
    shippingFee: shipping,
    shippingVaries: varies,
    pointDiscount,
    totalCharged: Math.max(0, subtotal + shipping - pointDiscount),
    taxes: taxBreakdown(params.lines, shipping),
  };
}

const YEN = new Intl.NumberFormat("ja-JP");

export function formatYen(value: number): string {
  return `${YEN.format(value)}円`;
}
