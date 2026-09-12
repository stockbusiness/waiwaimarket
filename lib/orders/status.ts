import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * 注文の状態遷移（docs/06 フェーズ3-4）。
 * IO を持たない判定だけを置く。実行はフェーズ3 の各処理。
 *
 * 状態は 0001 の order_status に合わせる。
 *   pending             決済待ち
 *   paid                決済済み・発送前
 *   shipped             発送済み
 *   completed           完了
 *   cancelled           取消（決済前、または発送前の取消）
 *   refunded            全額返金
 *   partially_refunded  一部返金
 */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "決済待ち",
  paid: "発送準備中",
  shipped: "発送済み",
  completed: "完了",
  cancelled: "キャンセル",
  refunded: "返金済み",
  partially_refunded: "一部返金",
};

/** 誰の操作か。同じ遷移でも実行できる立場が違う */
export type OrderActor = "buyer" | "tenant" | "hq" | "system";

export const ORDER_ACTIONS = [
  "pay",
  "ship",
  "complete",
  "cancel",
  "refund_full",
  "refund_partial",
] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

type Transition = {
  from: OrderStatus[];
  to: OrderStatus;
  /** これを実行できる立場 */
  actors: OrderActor[];
};

const TRANSITIONS: Record<OrderAction, Transition> = {
  // 決済の成功は Stripe の通知で入る。人が押すものではない
  pay: { from: ["pending"], to: "paid", actors: ["system"] },

  ship: { from: ["paid"], to: "shipped", actors: ["tenant", "hq"] },

  // 配送完了の自動検知は MVP の対象外（docs/06 11章）。
  // 発送から一定期間で確定するか、購入者の操作で完了にする
  complete: { from: ["shipped"], to: "completed", actors: ["buyer", "system", "hq"] },

  /**
   * 発送前だけ取り消せる。発送後は返金の扱いになる。
   *
   * 決済済みの取消は、お金の返却を伴う（返金処理は走る）。それでも状態は
   * `refunded` ではなく `cancelled` にする。「商品が届いたあとに返した」のと
   * 「そもそも届かなかった」のは別の出来事で、同じ状態にまとめると
   * 精算や問い合わせで区別できなくなる。
   *
   * この切り分けのため、`refund_full` は `paid` から進めない。
   * 同じ状況に 2 つの終わり方があると、データが割れる。
   */
  cancel: { from: ["pending", "paid"], to: "cancelled", actors: ["buyer", "tenant", "hq"] },

  refund_full: {
    from: ["shipped", "completed", "partially_refunded"],
    to: "refunded",
    actors: ["tenant", "hq"],
  },

  refund_partial: {
    from: ["shipped", "completed", "partially_refunded"],
    to: "partially_refunded",
    actors: ["tenant", "hq"],
  },
};

/** これ以上動かない状態 */
const TERMINAL: OrderStatus[] = ["cancelled", "refunded"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.includes(status);
}

export function isOrderAction(value: string): value is OrderAction {
  return (ORDER_ACTIONS as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, action: OrderAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export function nextStatus(action: OrderAction): OrderStatus {
  return TRANSITIONS[action].to;
}

export function actorCan(actor: OrderActor, action: OrderAction): boolean {
  return TRANSITIONS[action].actors.includes(actor);
}

/**
 * その立場がいまの状態から実行できる操作。
 *
 * 画面のボタンを出し分けるのに使う。実際の可否は API 側でも見る
 * （docs/00 8.2「RLS だけに依存しない」と同じ考え方で、画面の出し分けは
 * 守りではない）。
 */
export function availableActions(
  status: OrderStatus,
  actor: OrderActor,
): OrderAction[] {
  return ORDER_ACTIONS.filter(
    (action) => canTransition(status, action) && actorCan(actor, action),
  );
}

/**
 * 購入者が取消を申請できるか（docs/04 9.1 の cancel-request）。
 *
 * 申請であって取消そのものではない。テナントが承諾して初めて
 * `cancel` が走る。ここでは「申請を出せる状態か」だけを判定する。
 */
export function canRequestCancel(status: OrderStatus): boolean {
  return status === "pending" || status === "paid";
}
