import { z } from "zod";

/** サイト共通ページ（利用規約・プライバシーポリシー・特商法表記・会社概要など）の入力 */

/**
 * 予約済みの slug。`/legal/<slug>` に置くため、既存の経路と衝突させない。
 * 現時点で `/legal` 配下に他の画面は無いが、後から足したときに
 * 「ページが作れてしまっていた」状態にならないよう先に押さえる。
 */
const RESERVED_SLUGS = new Set(["api", "new", "edit"]);

export const sitePageSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "英小文字・数字・ハイフンで入力してください")
    .refine((value) => !RESERVED_SLUGS.has(value), "この URL は使用できません"),
  title: z.string().trim().min(1).max(80),
  /** フッターでの並び順。小さいほど先 */
  sortOrder: z.coerce.number().int().min(0).max(9999),
  /** 本文（限定した Markdown。lib/markdown/parse.ts を参照） */
  body: z.string().trim().min(1).max(60000),
  /** 改定内容のメモ。社内用で公開しない */
  /*
   * 未入力は undefined にする。`.optional().or(z.literal(""))` にすると、
   * 最小長のない文字列は空文字のまま最初の枝を通ってしまい、
   * DB に空文字が入る（tenant.ts の登録番号は regex があるため起きない）。
   */
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
  /**
   * 保存と同時に公開するか。
   * 公開すると、いま保存した版がそのまま公開版になる。
   */
  publish: z.boolean(),
});

export type SitePageInput = z.infer<typeof sitePageSchema>;

/** 非公開に戻す操作。本文を伴わないので別のスキーマにする */
export const sitePageUnpublishSchema = z.object({
  action: z.literal("unpublish"),
});
