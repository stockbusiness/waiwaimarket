import "server-only";

import type { MarketSupabaseClient } from "@/lib/supabase/server";
import type { PointEntryType, PointLotStatus } from "@/lib/supabase/database.types";

/**
 * 購入者のポイント残高と履歴（docs/02 6.2、docs/06 フェーズ4-6）。
 *
 * 呼び出し元のセッションのクライアントを受け取る。0002 の
 * `point_account_self` / `point_ledger_self` / `point_lots_self` が自分の
 * 行だけに絞る。ビューは 0005 で `security_invoker = on` にしてあるので、
 * ビュー越しでも他人の残高は見えない。
 *
 * **残高を口座に持たない。** すべて台帳とロットの集計から出す
 * （CLAUDE.md 絶対ルール「ポイント残高を直接更新しない」）。
 * `point_balances` ビューがその集計。
 */

export type PointBalance = {
  /** 確定済みで使える分（予約中を含む） */
  availablePoints: number;
  /** 付与予定。発送登録＋14 日で確定する */
  pendingPoints: number;
  /** 購入手続き中に押さえている分 */
  reservedPoints: number;
  /** いま実際に使える分。**マイナスになりうる**（docs/02 6.4） */
  usablePoints: number;
};

/** 口座が無い＝まだ一度も付与されていない。0 として扱う */
const EMPTY: PointBalance = {
  availablePoints: 0,
  pendingPoints: 0,
  reservedPoints: 0,
  usablePoints: 0,
};

export async function getBalance(
  client: MarketSupabaseClient,
  buyerId: string,
): Promise<PointBalance> {
  const { data, error } = await client
    .from("point_balances")
    .select("available_points, pending_points, reserved_points, usable_points")
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return EMPTY;

  return {
    availablePoints: data.available_points,
    pendingPoints: data.pending_points,
    reservedPoints: data.reserved_points,
    usablePoints: data.usable_points,
  };
}

export type PointHistoryEntry = {
  id: string;
  entryType: PointEntryType;
  /** 増加は正、減少は負 */
  delta: number;
  reason: string;
  orderId: string | null;
  occurredAt: string;
};

/**
 * 履歴。新しい順。
 *
 * 台帳をそのまま見せる。残高だけ出して内訳を見せないと、購入者は
 * 「なぜ減ったのか」を問い合わせるしかなくなる。
 */
export async function listHistory(
  client: MarketSupabaseClient,
  buyerId: string,
  limit = 50,
): Promise<PointHistoryEntry[]> {
  const { data, error } = await client
    .from("point_ledger_entries")
    .select("id, entry_type, delta, reason, order_id, occurred_at")
    .eq("buyer_id", buyerId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    delta: row.delta,
    reason: row.reason,
    orderId: row.order_id,
    occurredAt: row.occurred_at,
  }));
}

export type ExpiringLot = {
  id: string;
  remainingPoints: number;
  expiresAt: string;
  status: PointLotStatus;
};

/**
 * 期限の近いロット。
 *
 * **失効は黙って起きる。** 気づけるよう、使える分のうち期限が近いものを
 * 前に出す。確定前（`pending`）も含めるのは、確定を待っているあいだに
 * 期限が来るルール設定を運用で見つけられるようにするため。
 */
export async function listExpiringLots(
  client: MarketSupabaseClient,
  buyerId: string,
  limit = 10,
): Promise<ExpiringLot[]> {
  const { data, error } = await client
    .from("point_lots")
    .select("id, remaining_points, expires_at, status")
    .eq("buyer_id", buyerId)
    .in("status", ["pending", "available"])
    .gt("remaining_points", 0)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    remainingPoints: row.remaining_points,
    expiresAt: row.expires_at,
    status: row.status,
  }));
}
