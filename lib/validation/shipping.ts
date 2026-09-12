import { z } from "zod";

/**
 * 送料の設定（docs/00 5.2）。
 *
 * 金額は円の整数。地域別送料（shipping_profiles.region_rules）は
 * jsonb の構造が docs で未定義なので、ここでは扱わない。
 */
export const shippingProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** 基本送料 */
  baseFee: z.coerce.number().int().min(0).max(100_000),
  /**
   * この金額以上で送料無料。空なら常に基本送料。
   * 0 を「無料しきい値 0 円＝常に無料」と読み違えないよう、
   * 未設定は null にする
   */
  freeThreshold: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  /** 発送までの目安（日） */
  leadTimeDays: z.coerce.number().int().min(0).max(60),
});

export type ShippingProfileInput = z.infer<typeof shippingProfileSchema>;
