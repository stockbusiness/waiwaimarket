/**
 * 公開画面での価格と在庫の見せ方（docs/06 フェーズ2-4）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * ここで決めるのは「表示」だけ。実際に請求する金額は注文時にサーバーで
 * 引き直す（CLAUDE.md 全般「クライアントから来た金額を信用しない」）。
 */

export type VariantForDisplay = {
  priceInclTax: number;
  isActive: boolean;
  quantity: number;
  /** 購入手続き中に押さえられている数 */
  reservedQuantity: number;
};

export type PriceRange = {
  min: number;
  max: number;
  /** 幅があるか（「1,000円〜」の表示にするか） */
  hasRange: boolean;
};

/**
 * 販売中の SKU から価格の幅を出す。
 *
 * 在庫切れの SKU も価格には含める。売り切れでも「いくらの商品か」は
 * 見せたいし、在庫が戻ったときに表示価格が変わると不審に見える。
 * 販売中の SKU が 1 つも無ければ null（値段の付いていない商品）。
 */
export function priceRange(variants: VariantForDisplay[]): PriceRange | null {
  const prices = variants.filter((v) => v.isActive).map((v) => v.priceInclTax);
  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, hasRange: min !== max };
}

/**
 * その SKU をいま買えるか。
 *
 * 引当済みを引く。引当は購入手続き中の 15 分間だけ押さえられている数
 * （docs/06 4.2）で、これを引かないと、既に押さえられた在庫を
 * 「在庫あり」と見せて最後に買えないことになる。
 */
export function availableQuantity(variant: VariantForDisplay): number {
  return Math.max(0, variant.quantity - variant.reservedQuantity);
}

/** 商品として買える SKU が 1 つでもあるか */
export function isInStock(variants: VariantForDisplay[]): boolean {
  return variants.some((v) => v.isActive && availableQuantity(v) > 0);
}

const YEN = new Intl.NumberFormat("ja-JP");

/** 「1,980円」「1,980円〜」。円は税込（product_variants.price_incl_tax） */
export function formatPriceRange(range: PriceRange | null): string {
  if (!range) return "価格未設定";
  return range.hasRange
    ? `${YEN.format(range.min)}円〜`
    : `${YEN.format(range.min)}円`;
}

export function formatYen(value: number): string {
  return `${YEN.format(value)}円`;
}
