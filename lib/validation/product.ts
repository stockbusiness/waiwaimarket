import { z } from "zod";

/**
 * 商品・SKU・画像・カテゴリーの入力（docs/06 フェーズ2-1）。
 *
 * 金額は円の整数で扱う。小数で持つと、税や送料やポイントの配分で
 * 端数が積もって合計が合わなくなる（docs/02 の最大剰余方式は整数前提）。
 * クライアントから来た金額は信用せず、注文時にサーバーで引き直す
 * （CLAUDE.md 全般）。ここで検証するのは「テナントが設定した定価」であって、
 * 購入時の請求額ではない。
 */

/** 円の整数。1000万円を超える商品は当面扱わない */
const yen = z.coerce.number().int().min(0).max(10_000_000);

export const productBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  /** 未選択は null。審査に出すときに必須になる（lib/products/status.ts） */
  categoryId: z.uuid().nullable(),
});

export type ProductBodyInput = z.infer<typeof productBodySchema>;

export const variantSchema = z.object({
  /** 既存行の更新なら id を送る。新規なら省く */
  id: z.uuid().optional(),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "英数字・ハイフン・下線で入力してください"),
  optionLabel: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
  priceInclTax: yen,
  /**
   * 税率。標準 10%、軽減 8%。この 2 つ以外は扱わない。
   * 自由入力にすると、テナントの打ち間違いが請求額に直結する。
   */
  taxRate: z.union([z.literal(0.1), z.literal(0.08)]),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
});

export type VariantInput = z.infer<typeof variantSchema>;

export const variantsSchema = z
  .array(variantSchema)
  .max(50)
  .refine(
    (rows) => new Set(rows.map((row) => row.sku)).size === rows.length,
    "同じ SKU が重複しています",
  );

/** 画像は登録後の並べ替え・削除だけをここで扱う。実体の保存は Storage */
export const productImagesSchema = z
  .array(
    z.object({
      id: z.uuid(),
      sortOrder: z.coerce.number().int().min(0).max(99),
    }),
  )
  .max(10);

/**
 * 本部の商品審査（docs/06 フェーズ2-2）。
 *
 * 理由の必須は `lib/products/review.ts` の `requiresNote()` で見る。
 * ここで action ごとに分けると、画面と API で判定が二重になる。
 */
export const productReviewSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reinstate"]),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ProductReviewInput = z.infer<typeof productReviewSchema>;

/** 本部のカテゴリー管理（docs/00 5.3「カテゴリー・特集管理」） */
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "英小文字・数字・ハイフンで入力してください"),
  parentId: z.uuid().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
