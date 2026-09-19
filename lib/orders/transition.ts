import "server-only";

import type { OrderStatus } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { actorCan, canTransition, nextStatus, type OrderAction, type OrderActor } from "./status";

/**
 * 注文の状態遷移の実行（docs/06 フェーズ3-4）。
 *
 * 可否の判定は `lib/orders/status.ts`（IO を持たない純粋関数）に置いてある。
 * 画面のボタンの出し分けと、ここでの受け付け判定が同じものを通る。
 *
 * **書き込みは呼び出し元のセッションで行う。** 0015 の
 * `orders_tenant_update` が自店の注文に絞り、`orders_guard_columns()` が
 * 金額列を守る。service_role で書くと RLS 側が素通りになり、ポリシーの
 * 誤りに気づけなくなる（商品審査と同じ判断）。
 *
 * 在庫の解放だけは service_role。`inventory_reservations` は RLS 有効で
 * ポリシーを置いていないため（0004）、サーバー処理からしか触れない。
 */

export type TransitionResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; reason: "not_found" | "invalid_transition" | "forbidden" };

/**
 * 状態を動かす。
 *
 * **読んだときの状態を条件に書く。** `eq("status", from)` を付けてあるので、
 * 2 人の担当者が同じ注文を開いていても、後から押したほうが前の判断を
 * 黙って上書きしない。0 件更新なら `invalid_transition` を返してやり直させる
 * （商品審査・問い合わせと同じ形）。
 */
export async function transitionOrder(
  client: MarketSupabaseClient,
  params: {
    orderId: string;
    /** 呼び出し側が読んだときの状態 */
    from: OrderStatus;
    action: OrderAction;
    actor: OrderActor;
    /** `ship` のときだけ。どちらも任意（追跡の無い配送方法がある） */
    shipment?: { carrier?: string; trackingNumber?: string };
  },
): Promise<TransitionResult> {
  if (!actorCan(params.actor, params.action)) return { ok: false, reason: "forbidden" };
  if (!canTransition(params.from, params.action)) {
    return { ok: false, reason: "invalid_transition" };
  }

  const to = nextStatus(params.action);

  // 発送は状態と記録をまとめて書く（0015 の `ship_order`）。
  //
  // **アプリから 2 回に分けない。** 片方だけ成功すると「発送済みなのに
  // 記録が無い」注文ができ、`shipments.shipped_at` を起点にする
  // ポイント確定（発送登録日＋14日、docs/02 6.1）が出せなくなる。
  // 関数は invoker なので、RLS はそのまま効く
  if (params.action === "ship") {
    const { data: shipped, error: shipError } = await client.rpc("ship_order", {
      p_order_id: params.orderId,
      p_carrier: params.shipment?.carrier ?? null,
      p_tracking: params.shipment?.trackingNumber ?? null,
    });
    if (shipError) throw shipError;
    return shipped ? { ok: true, status: to } : { ok: false, reason: "invalid_transition" };
  }

  const { data, error } = await client
    .from("orders")
    .update({ status: to })
    .eq("id", params.orderId)
    .eq("status", params.from)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "invalid_transition" };

  // 取消で押さえたままにすると、他の人が買えない。
  //
  // **状態を変えたあとに解放する。** 先に解放すると、状態の更新が
  // 0 件（＝ほかの担当者が先に動かした）だったときに在庫だけ戻る。
  // 二重に呼んでも在庫は二重に戻らない（0011・0015）ので、こちらの順で安全
  if (params.action === "cancel") {
    const service = createSupabaseServiceClient();
    const { error: releaseError } = await service.rpc("release_order_reservations", {
      p_order_id: params.orderId,
    });
    if (releaseError) throw releaseError;
  }

  return { ok: true, status: to };
}

/**
 * 確保が切れた「決済待ち」を畳むバッチ（2026-09-19 決定）。
 *
 * 決済が繋がるまで注文は `pending` のまま動かない。引当は 15 分で切れて
 * 在庫は戻るが、注文行はそのまま残り、購入者の一覧に永久に決済待ちの行が
 * 並ぶ。有効な引当が 1 つも無い決済待ちを取消にする。
 *
 * 冪等（CLAUDE.md 全般「バッチ処理はすべて冪等」）。判定は 0015 の
 * `expire_pending_orders()` の中。
 */
export async function expirePendingOrders(): Promise<number> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("expire_pending_orders");
  if (error) throw error;
  return data ?? 0;
}
