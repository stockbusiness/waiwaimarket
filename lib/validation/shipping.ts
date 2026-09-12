import { z } from "zod";

import { EMPTY_REGION_RULES, MAX_SHIPPING_FEE, regionRulesSchema } from "@/lib/shipping/region";

/**
 * 送料の設定（docs/00 5.2）。
 *
 * 金額は円の整数。地域別送料（shipping_profiles.region_rules）の形は
 * lib/shipping/region.ts が持つ。同じ形を 0012 の検査制約でも見る。
 */
export const shippingProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** 基本送料 */
  baseFee: z.coerce.number().int().min(0).max(MAX_SHIPPING_FEE),
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
  /**
   * 地域別送料。未指定は「地域別なし」。
   *
   * 送られてこなかったときに既存のルールを残さない。画面から
   * 全部消したのか、項目ごと送られていないのかを区別できないため、
   * 「送られてきた内容がそのまま保存後の姿」に揃える
   * （variants の一括保存と同じ考え方。docs/04 9.2）。
   */
  regionRules: regionRulesSchema.optional().transform((value) => value ?? EMPTY_REGION_RULES),
});

export type ShippingProfileInput = z.infer<typeof shippingProfileSchema>;
