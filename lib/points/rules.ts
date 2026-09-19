/**
 * ポイントのルール（docs/02 6.1）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「還元率、有効期限、確定日数、利用上限、警告基準額、キャンペーン上限は
 * ハードコードせず、管理画面から変更可能にする。変更は既存注文へ遡及適用せず、
 * 注文確定時のルールを保存する」
 *
 * **比率は万分率の整数で持つ**（1% = 100、50% = 5000）。
 * `point_rules.rate` は `numeric(5,4)`、`usage_cap_ratio` は `numeric(4,3)` で、
 * どちらも誤差なく表せる。
 *
 * **危ないのは読み取りのほう。** `Number("0.0003") * 10000` は `2` になる。
 * 1 万通りの比率のうち **573 件**がこの下振れを起こす（実測した）。
 * 掛け算のほう（`金額 × 万分率 ÷ 10000`）は 200 万円まで調べても浮動小数と
 * 食い違わないが、読み取りは全域で壊れる。だから `parseRatio()` は
 * `Number()` を通さず、文字列のまま桁を数える。
 */

/** 100% を表す値。比率はすべてこの単位（万分率）の整数で持つ */
export const BASIS_POINTS = 10_000;

const DECIMALS = 4;

/**
 * `numeric` の値を万分率の整数にする。
 *
 * Supabase の JS クライアントは `numeric` を文字列で返す（精度を落とさない
 * ため）。`Number()` を通してから掛けると誤差が出るので、文字列のまま桁を
 * 数える。
 *
 * 万分率で表せない細かさは切り捨てる。`numeric(5,4)` なら起きないが、
 * 想定外の値が来たときに黙って四捨五入して上振れさせない。
 */
export function parseRatio(value: string | number): number {
  const text = typeof value === "number" ? String(value) : value.trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`比率として読めません: ${value}`);
  }

  const [integerPart, fractionPart = ""] = text.split(".");
  const fraction = fractionPart.slice(0, DECIMALS).padEnd(DECIMALS, "0");
  const basisPoints = Number(integerPart) * BASIS_POINTS + Number(fraction);

  if (basisPoints > BASIS_POINTS) {
    throw new Error(`比率は 0 以上 1 以下です: ${value}`);
  }
  return basisPoints;
}

/**
 * 注文時点のルール。`orders.point_rule_snapshot` に入れる。
 *
 * **ルール変更を既存注文に遡及適用しない**（CLAUDE.md 絶対ルール）ため、
 * 注文のたびにこの形で写し取る。返品のときはこの値で計算し直す。
 */
export type PointRuleSnapshot = {
  /** 還元率。万分率（1% = 100） */
  rateBasisPoints: number;
  /** 利用上限。万分率（50% = 5000） */
  usageCapBasisPoints: number;
  /** 発送登録日から確定までの日数 */
  confirmAfterDays: number;
  /** 付与日から失効までの月数 */
  expireAfterMonths: number;
  /** 負担者。本部負担なら null ではなく本部の funding_source を指す */
  fundingSourceId: string | null;
};

type RuleRow = {
  rate: string | number;
  usage_cap_ratio: string | number;
  confirm_after_days: number;
  expire_after_months: number;
  funding_source_id: string | null;
};

export function toSnapshot(row: RuleRow): PointRuleSnapshot {
  return {
    rateBasisPoints: parseRatio(row.rate),
    usageCapBasisPoints: parseRatio(row.usage_cap_ratio),
    confirmAfterDays: row.confirm_after_days,
    expireAfterMonths: row.expire_after_months,
    fundingSourceId: row.funding_source_id,
  };
}
