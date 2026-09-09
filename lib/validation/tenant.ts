import { z } from "zod";

/** 出店申請の入力。金額に関わる値は持たせない（サーバー側で扱うものだけ） */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const tenantApplicationSchema = z.object({
  /** マーケット上の表示名 */
  name: trimmed(80),
  /** 登記上の名称 */
  legalName: trimmed(120),
  representativeName: trimmed(60),
  address: trimmed(200),
  phone: trimmed(20).regex(/^[0-9+\-() ]+$/, "電話番号の形式が正しくありません"),
  email: z.string().trim().email().max(200),
  /** 適格請求書発行事業者の登録番号。任意（docs/01 4.5 は専門家確認の対象） */
  invoiceRegistrationNumber: z
    .string()
    .trim()
    .regex(/^T\d{13}$/, "登録番号は T で始まる 14 桁で入力してください")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  returnPolicy: z.string().trim().max(2000).optional(),
});

export type TenantApplicationInput = z.infer<typeof tenantApplicationSchema>;

export const tenantReviewSchema = z.object({
  action: z.enum(["start_review", "approve", "reject", "suspend", "reinstate"]),
  /** 差戻し・停止の理由。監査ログに残す */
  reason: z.string().trim().max(1000).optional(),
});

export type TenantReviewInput = z.infer<typeof tenantReviewSchema>;

/** 店舗ページの編集 */
export const storeSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "英小文字・数字・ハイフンで入力してください"),
  displayName: trimmed(60),
  description: z.string().trim().max(2000).optional(),
  isPublic: z.boolean(),
});

export type StoreInput = z.infer<typeof storeSchema>;

/** 事業者情報（特商法表記）の編集。テナント管理者のみ */
export const legalProfileSchema = tenantApplicationSchema.omit({ name: true });

export type LegalProfileInput = z.infer<typeof legalProfileSchema>;
