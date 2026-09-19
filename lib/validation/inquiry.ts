import { z } from "zod";

import { MAX_MESSAGE_LENGTH } from "@/lib/inquiries/status";

/**
 * 問い合わせの入力（docs/04 9.1・9.2）。
 *
 * 受け取るのは商品IDと本文だけ。宛先のテナントは商品から引き直す
 * （クライアントから来たテナントIDを信用しない。カート投入と同じ考え方）。
 *
 * 長さは 0014 の検査制約 `inquiry_message_body_length` と同じ値を使う。
 * アプリで弾き、DB でも弾く（CLAUDE.md「認可は RLS と API の両方で行う」と
 * 同じ理由で、形も二重に見る）。
 */

/**
 * 本文。
 *
 * `trim()` を先に通すのは、空白だけの投稿を「入力あり」と数えないため。
 * 0014 の `inquiry_message_body_not_blank` が `btrim(body) <> ''` で
 * 同じものを拒否する。
 */
const body = z
  .string()
  .trim()
  .min(1, "本文を入力してください")
  .max(MAX_MESSAGE_LENGTH, `本文は${MAX_MESSAGE_LENGTH}文字までです`);

export const inquiryCreateSchema = z.object({
  productId: z.uuid(),
  body,
});

export type InquiryCreateInput = z.infer<typeof inquiryCreateSchema>;

export const inquiryMessageSchema = z.object({ body });

export type InquiryMessageInput = z.infer<typeof inquiryMessageSchema>;

/** テナントの操作。完了にする・再開する */
export const inquiryActionSchema = z.object({
  action: z.enum(["close", "reopen"]),
});

export type InquiryActionInput = z.infer<typeof inquiryActionSchema>;
