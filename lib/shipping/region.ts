import { z } from "zod";

import { PREFECTURE_COUNT, isPrefectureCode } from "./prefectures";

/**
 * 地域別送料（`shipping_profiles.region_rules`）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * ```json
 * { "version": 1, "rules": [{ "prefectures": ["01"], "fee": 1200 }] }
 * ```
 *
 * **値はテナント、構造は本部。** いくらにするかを決めるのは配送業者と
 * 契約しているテナントだが、jsonb の形そのものはシステムの仕様で、
 * テナントごとに変えられない。自由な形を入れられるようにすると、
 * サーバーが送料を計算できなくなる（CLAUDE.md 全般ルール
 * 「金額はすべてサーバー側で再計算する」）。
 *
 * **`rules` に出てこない都道府県は基本送料（`base_fee`）。** 全 47 件を
 * 必ず埋めさせない。多くのテナントは「沖縄と北海道だけ違う」で足りる。
 *
 * **送料無料しきい値が勝つ。** しきい値を超えたら地域別送料も 0 円にする。
 * 「5,000円以上で送料無料（ただし沖縄を除く）」は購入者に説明しづらく、
 * 会計側でも例外が増える。
 *
 * **離島・中継料は表せない。** 郵便番号単位でないと書けないため、v1 では
 * 扱わない（2026-09-12 決定）。必要なテナントは基本送料に織り込む。
 * 将来入れるときは `version: 2` として、この版の行はそのまま読めるようにする。
 */

export const REGION_RULES_VERSION = 1;

/** 送料の上限。lib/validation/shipping.ts の基本送料と揃える */
export const MAX_SHIPPING_FEE = 100_000;

const prefectureCode = z.string().refine(isPrefectureCode, {
  message: "都道府県コードが不正です",
});

export const regionRuleSchema = z.object({
  prefectures: z.array(prefectureCode).min(1).max(PREFECTURE_COUNT),
  fee: z.coerce.number().int().min(0).max(MAX_SHIPPING_FEE),
});

/**
 * 保存する形。
 *
 * **同じ都道府県が 2 つのルールに出てきたら弾く。** 通せば、どちらの金額に
 * なるかが配列の順序で決まる。テナントの画面には順序が見えないので、
 * 意図しない金額が黙って選ばれる。保存時に気づかせる。
 */
export const regionRulesSchema = z
  .object({
    version: z.literal(REGION_RULES_VERSION),
    rules: z.array(regionRuleSchema).max(PREFECTURE_COUNT),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const rule of value.rules) {
      for (const code of rule.prefectures) {
        if (seen.has(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["rules"],
            message: `同じ都道府県が 2 回指定されています（${code}）`,
          });
          return;
        }
        seen.add(code);
      }
    }
  });

export type RegionRule = z.infer<typeof regionRuleSchema>;
export type RegionRules = z.infer<typeof regionRulesSchema>;

export const EMPTY_REGION_RULES: RegionRules = { version: REGION_RULES_VERSION, rules: [] };

/**
 * DB から読んだ jsonb を形に落とす。
 *
 * 形が違えば「地域別なし」として扱う。形の担保は 0012 の検査制約
 * （`shipping_profiles_region_rules_shape`）が持っていて、ここは
 * 制約を入れる前の行（既定値が `{}` だった）に対する最後の受け皿。
 * ここで例外にすると、カート画面そのものが購入者に出せなくなる。
 */
export function parseRegionRules(value: unknown): RegionRules {
  const parsed = regionRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_REGION_RULES;
}

/**
 * その都道府県の送料。`rules` に無ければ基本送料。
 *
 * 一致するルールが複数あれば最初のものを使う。`regionRulesSchema` が
 * 重複を弾くので通常は起きないが、順序で決まる（jsonb は配列の順序を
 * 保つ）ため、同じデータなら何度計算しても同じ結果になる。
 */
export function regionFee(
  rules: RegionRules,
  baseFee: number,
  prefectureCode: string,
): number {
  const hit = rules.rules.find((rule) => rule.prefectures.includes(prefectureCode));
  return hit ? hit.fee : baseFee;
}

export type FeeRange = {
  min: number;
  max: number;
  /** 届け先によって金額が変わる。カートでは「〜円から」と出す */
  varies: boolean;
};

/**
 * 届け先が決まる前に出せる範囲。
 *
 * **全 47 都道府県がルールで覆われていれば、基本送料は候補に入らない。**
 * 入れてしまうと、実際には誰も払わない金額が下限として表示される。
 */
export function feeRange(rules: RegionRules, baseFee: number): FeeRange {
  const covered = new Set(rules.rules.flatMap((rule) => rule.prefectures));
  const candidates = rules.rules.map((rule) => rule.fee);
  if (covered.size < PREFECTURE_COUNT) candidates.push(baseFee);

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  return { min, max, varies: min !== max };
}
