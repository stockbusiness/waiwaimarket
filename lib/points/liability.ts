import "server-only";

import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 本部から見たポイントの発行状況（docs/02 4.4、docs/06 フェーズ4-7）。
 *
 * 0005 の `point_outstanding_liability` と `point_monthly_movements` を
 * そのまま読む。どちらも `security_invoker = on` なので、読めるのは
 * `point_lots_hq_read` / `point_ledger_hq_read` を通せる本部オペレーター
 * 以上に限られる（API 側の `requireHqOperator` と二重になる）。
 *
 * **合計をアプリ側で数え直さない。** 未使用ポイントの残高は
 * 「ロットの残量の合計」であって「台帳の増減の合計」ではない。
 * 2 か所で別々に足すと、失効や取り消しの扱いがずれたときに
 * どちらが正しいか分からなくなる。集計はビューに一本化する。
 */

export type OutstandingRow = {
  fundingSourceType: string;
  ruleScope: string;
  pendingPoints: number;
  availablePoints: number;
  maxDiscountReserve: number;
};

export type OutstandingSummary = {
  rows: OutstandingRow[];
  /** 全体の最大値引き原資（確定待ち＋利用可能） */
  totalReserve: number;
  /** うち本部負担。docs/02 4.4 の「最大値引き原資」 */
  headquartersReserve: number;
};

export async function getOutstanding(
  client: MarketSupabaseClient,
): Promise<OutstandingSummary> {
  const { data, error } = await client
    .from("point_outstanding_liability")
    .select(
      "funding_source_type, rule_scope, pending_points, available_points, max_discount_reserve",
    );

  if (error) throw error;

  const rows: OutstandingRow[] = (data ?? []).map((row) => ({
    fundingSourceType: row.funding_source_type,
    ruleScope: row.rule_scope,
    pendingPoints: row.pending_points,
    availablePoints: row.available_points,
    maxDiscountReserve: row.max_discount_reserve,
  }));

  return {
    rows,
    totalReserve: rows.reduce((sum, row) => sum + row.maxDiscountReserve, 0),
    headquartersReserve: rows
      .filter((row) => row.fundingSourceType === "headquarters")
      .reduce((sum, row) => sum + row.maxDiscountReserve, 0),
  };
}

export type MonthlyMovement = {
  /** 月初の日付（`2026-09-01`） */
  yearMonth: string;
  issuedPoints: number;
  confirmedPoints: number;
  usedPoints: number;
  expiredPoints: number;
  reversedPoints: number;
  adjustedPoints: number;
};

/**
 * 月次の発行・利用（新しい順）。
 *
 * ビューは負担元・ルール種別で分かれているので、月でまとめ直す。
 * 内訳は未確定事項（基本還元の月次警告基準額）が決まってから足す。
 */
export async function listMonthlyMovements(
  client: MarketSupabaseClient,
  months = 6,
): Promise<MonthlyMovement[]> {
  const { data, error } = await client
    .from("point_monthly_movements")
    .select(
      "year_month, issued_points, confirmed_points, used_points, expired_points, reversed_points, adjusted_points",
    )
    .order("year_month", { ascending: false });

  if (error) throw error;

  const byMonth = new Map<string, MonthlyMovement>();
  for (const row of data ?? []) {
    const current = byMonth.get(row.year_month) ?? {
      yearMonth: row.year_month,
      issuedPoints: 0,
      confirmedPoints: 0,
      usedPoints: 0,
      expiredPoints: 0,
      reversedPoints: 0,
      adjustedPoints: 0,
    };
    current.issuedPoints += row.issued_points;
    current.confirmedPoints += row.confirmed_points;
    current.usedPoints += row.used_points;
    current.expiredPoints += row.expired_points;
    current.reversedPoints += row.reversed_points;
    current.adjustedPoints += row.adjusted_points;
    byMonth.set(row.year_month, current);
  }

  // ビューの order は負担元ごとの行に効くので、まとめ直したあとで並べ直す
  return [...byMonth.values()]
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1))
    .slice(0, months);
}
