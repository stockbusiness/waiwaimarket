import { z } from "zod";

/**
 * 基本還元ルールの入力（docs/02 6.1、docs/06 フェーズ4-7）。
 *
 * **比率は画面から「％」で受け取り、万分率の整数で持つ**（1% = 100）。
 * 小数のまま受けると `Number("0.0003")` の下振れ（`lib/points/rules.ts` の
 * コメント参照）と同じ経路に乗る。整数で受けて整数のまま DB へ渡す。
 *
 * 範囲は 0003 の検査制約と同じにしてある。DB が最後の砦で、ここは
 * 「入力の段階で分かる誤りを、保存を試みる前に返す」ためのもの。
 */

/** 万分率。1% = 100、100% = 10000 */
const basisPoints = z.coerce.number().int().min(0).max(10_000);

export const pointRuleSchema = z.object({
  /**
   * 還元率。0% も許す（企画の切り替え時に一時的に止めたい場合がある）。
   */
  rateBasisPoints: basisPoints,

  /**
   * 利用上限。**0 は許さない。**
   *
   * 0 にするとポイントを一切使えないルールになり、「利用停止」を上限の値で
   * 表すことになる。止めるならルールごと閉じる（0003 の
   * `point_rules_usage_cap_range` が `> 0` で同じものを拒否する）。
   */
  usageCapBasisPoints: basisPoints.refine((value) => value > 0, {
    message: "利用上限は 0% より大きくしてください",
  }),

  /**
   * 発送登録日から確定までの日数（docs/02 6.1 の初期値は 14）。
   *
   * 上限を設けないと、確定しないまま期限切れになるルールを作れてしまう。
   * 有効期限（月）との突き合わせは下の `refine` で見る。
   */
  confirmAfterDays: z.coerce.number().int().min(0).max(180),

  /** 付与日から失効までの月数（初期値は 12） */
  expireAfterMonths: z.coerce.number().int().min(1).max(120),
}).refine(
  // 確定より先に期限が来ると、一度も使えないポイントを配ることになる。
  // 月を 30 日として粗く見る。境目のずれより「明らかに逆」を止めるのが目的
  (rule) => rule.confirmAfterDays < rule.expireAfterMonths * 30,
  {
    message: "確定までの日数が有効期限を超えています。一度も使えないポイントになります",
    path: ["confirmAfterDays"],
  },
);

export type PointRuleInput = z.infer<typeof pointRuleSchema>;

/**
 * 保存の要求。**いま効いている版の id を必ず受け取る。**
 *
 * 2 人の本部管理者が同じ画面を開いていると、後から押したほうが前の変更を
 * 黙って上書きしてしまう。読んだ版を条件に閉じることで、ずれていれば
 * 0 件更新になり `conflict` を返せる（商品審査と同じ形）。
 */
export const pointRuleSaveSchema = z.object({
  currentId: z.uuid(),
  rule: pointRuleSchema,
});

export type PointRuleSaveInput = z.infer<typeof pointRuleSaveSchema>;
