import { z } from "zod";

import { MAX_LENGTHS, normalizePhone, normalizePostalCode } from "@/lib/addresses/address";
import { isPrefectureCode } from "@/lib/shipping/prefectures";

/**
 * 配送先住所の入力（docs/04 9.1）。
 *
 * **郵便番号と電話番号は弾かずに直す。** スマートフォンの日本語入力では
 * 全角のまま確定されることが多く、`１２３ー４５６７` を「形式が違います」と
 * 返すのは利用者に打ち直させるだけで得るものが無い。半角に直してから検査する。
 *
 * 形は 0013 の検査制約でも見る（CLAUDE.md「認可は RLS と API の両方で行う」と
 * 同じ理由で、形もアプリと DB の両方で見る）。
 */
export const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(MAX_LENGTHS.recipientName),

  postalCode: z
    .string()
    .transform((value) => normalizePostalCode(value))
    .refine((value): value is string => value !== null, {
      message: "郵便番号は 7 桁で入力してください",
    }),

  phone: z
    .string()
    .transform((value) => normalizePhone(value))
    .refine((value): value is string => value !== null, {
      message: "電話番号は 10 桁または 11 桁で入力してください",
    }),

  prefectureCode: z.string().refine(isPrefectureCode, {
    message: "都道府県を選んでください",
  }),

  city: z.string().trim().min(1).max(MAX_LENGTHS.city),
  addressLine1: z.string().trim().min(1).max(MAX_LENGTHS.addressLine1),

  /**
   * 建物名。空欄は null にする。
   *
   * 空文字のまま保存すると、住所を 1 行にしたときに余分な空白が入る。
   */
  addressLine2: z
    .string()
    .trim()
    .max(MAX_LENGTHS.addressLine2)
    .optional()
    .transform((value) => (value ? value : null)),

  /** 既定の配送先にするか。最初の 1 件は自動で既定になる */
  isDefault: z.boolean().optional().transform((value) => value ?? false),
});

export type AddressInput = z.infer<typeof addressSchema>;
