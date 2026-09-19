import "server-only";

import { recordAudit } from "@/lib/audit/log";
import type { HqRole } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";
import type { PointRuleInput } from "@/lib/validation/point-rule";

import { BASIS_POINTS, parseRatio } from "./rules";

/**
 * 基本還元ルールの読み書き（docs/02 6.1、docs/06 フェーズ4-7）。
 *
 * 呼び出し元のセッションのクライアントを受け取る。0004 の
 * `point_rules_hq_read`（オペレーター以上）と `point_rules_hq_write`
 * （管理者のみ）が効くので、API 側の認可と RLS の二重になる。
 *
 * **ルールは上書きせず版として積む。** docs/02 6.1「変更は既存注文へ
 * 遡及適用せず、注文確定時のルールを保存する」。上書きにすると、過去の
 * 注文が「いま何％だったか」を復元できなくなる。
 */

export type PointRuleView = {
  id: string;
  rateBasisPoints: number;
  usageCapBasisPoints: number;
  confirmAfterDays: number;
  expireAfterMonths: number;
  fundingSourceId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

const COLUMNS =
  "id, scope, rate, usage_cap_ratio, confirm_after_days, expire_after_months, funding_source_id, effective_from, effective_to";

type Row = {
  id: string;
  rate: string | number;
  usage_cap_ratio: string | number;
  confirm_after_days: number;
  expire_after_months: number;
  funding_source_id: string | null;
  effective_from: string;
  effective_to: string | null;
};

function toView(row: Row): PointRuleView {
  return {
    id: row.id,
    rateBasisPoints: parseRatio(row.rate),
    usageCapBasisPoints: parseRatio(row.usage_cap_ratio),
    confirmAfterDays: row.confirm_after_days,
    expireAfterMonths: row.expire_after_months,
    fundingSourceId: row.funding_source_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/**
 * いま効いている基本ルール。
 *
 * 0016 の部分一意索引（`point_rules_one_open_base`）が「閉じていない基本
 * ルールは 1 本」を保証するので、`maybeSingle()` で足りる。2 本開いていたら
 * 索引が先に拒否しているはず、という前提をここでも崩さない。
 */
export async function getCurrentBaseRule(
  client: MarketSupabaseClient,
): Promise<PointRuleView | null> {
  const { data, error } = await client
    .from("point_rules")
    .select(COLUMNS)
    .eq("scope", "base")
    .is("effective_to", null)
    .maybeSingle();

  if (error) throw error;
  return data ? toView(data as Row) : null;
}

/** 過去の版。新しい順。「いつ何％だったか」をたどる */
export async function listBaseRuleHistory(
  client: MarketSupabaseClient,
  limit = 20,
): Promise<PointRuleView[]> {
  const { data, error } = await client
    .from("point_rules")
    .select(COLUMNS)
    .eq("scope", "base")
    .order("effective_from", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => toView(row as Row));
}

/** 万分率を `numeric` へ戻す。`10000 → "1.0000"`、`100 → "0.0100"` */
function toNumeric(basisPoints: number, decimals: number): string {
  return (basisPoints / BASIS_POINTS).toFixed(decimals);
}

export type SaveRuleResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "conflict" };

/**
 * ルールを変える。**前の版を閉じてから新しい版を足す。**
 *
 * 順序が要点。0016 の部分一意索引は「閉じていない基本ルールは 1 本」なので、
 * 先に足すと索引に弾かれる（0013 の既定配送先と同じ形。あちらも
 * 「先に落としてから立てる」だった）。
 *
 * **読んだときの版を条件に閉じる。** 2 人の本部管理者が同じ画面を開いて
 * いると、後から押したほうが前の変更を黙って上書きしてしまう。0 件更新なら
 * `conflict` を返してやり直させる（商品審査・問い合わせと同じ形）。
 *
 * 2 文に分かれるので、閉じたあとに足すところで落ちると基本ルールが 1 本も
 * 開いていない状態になる。そのとき付与は止まるが、**誤った率で付与し続ける
 * より安全**という判断（`getCurrentBaseRule()` が null を返し、呼び出し側は
 * 付与しない）。画面には「基本ルールが設定されていません」と出る。
 */
export async function replaceBaseRule(
  client: MarketSupabaseClient,
  params: {
    currentId: string;
    input: PointRuleInput;
    actorId: string;
    actorRole: HqRole;
    ip: string | null;
  },
): Promise<SaveRuleResult> {
  const closedAt = new Date().toISOString();

  const { data: closed, error: closeError } = await client
    .from("point_rules")
    .update({ effective_to: closedAt })
    .eq("id", params.currentId)
    .is("effective_to", null)
    .select(
      "id, funding_source_id, rate, usage_cap_ratio, confirm_after_days, expire_after_months",
    )
    .maybeSingle();

  if (closeError) throw closeError;
  if (!closed) return { ok: false, reason: "conflict" };

  const { data, error } = await client
    .from("point_rules")
    .insert({
      scope: "base",
      target_id: null,
      rate: toNumeric(params.input.rateBasisPoints, 4),
      usage_cap_ratio: toNumeric(params.input.usageCapBasisPoints, 3),
      confirm_after_days: params.input.confirmAfterDays,
      expire_after_months: params.input.expireAfterMonths,
      // 負担元は引き継ぐ。基本還元は本部負担で固定（docs/02 4.4）
      funding_source_id: closed.funding_source_id,
      effective_from: closedAt,
    })
    .select("id")
    .single();

  if (error) throw error;

  // 還元率の変更は本部管理者の操作なので残す（docs/00 5.3、docs/05）。
  // 前後の値を両方入れておく。「いつ誰が何％から何％にしたか」が
  // 台帳と突き合わせられないと、過去の付与額の説明ができない
  await recordAudit({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "point_rule.replace",
    targetTable: "point_rules",
    targetId: data.id,
    detail: {
      closed_rule_id: closed.id,
      before: {
        rate_basis_points: parseRatio(closed.rate),
        usage_cap_basis_points: parseRatio(closed.usage_cap_ratio),
        confirm_after_days: closed.confirm_after_days,
        expire_after_months: closed.expire_after_months,
      },
      after: {
        rate_basis_points: params.input.rateBasisPoints,
        usage_cap_basis_points: params.input.usageCapBasisPoints,
        confirm_after_days: params.input.confirmAfterDays,
        expire_after_months: params.input.expireAfterMonths,
      },
    },
    ip: params.ip,
  });

  return { ok: true, id: data.id };
}
