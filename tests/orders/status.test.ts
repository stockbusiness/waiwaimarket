import { describe, expect, it } from "vitest";

import {
  ORDER_ACTIONS,
  actorCan,
  availableActions,
  canRequestCancel,
  canTransition,
  isOrderAction,
  isTerminal,
  nextStatus,
  type OrderActor,
} from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/supabase/database.types";

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
];

describe("決済", () => {
  it("決済待ちからのみ。しかもサーバー処理だけ", () => {
    // 決済の成功は Stripe の通知で入る。人が押すものではない
    expect(canTransition("pending", "pay")).toBe(true);
    expect(actorCan("system", "pay")).toBe(true);
    for (const actor of ["buyer", "tenant", "hq"] as OrderActor[]) {
      expect(actorCan(actor, "pay")).toBe(false);
    }
  });

  it("決済済みをもう一度決済済みにできない", () => {
    expect(canTransition("paid", "pay")).toBe(false);
  });
});

describe("発送", () => {
  it("決済済みからのみ、テナントか本部が行う", () => {
    expect(canTransition("paid", "ship")).toBe(true);
    expect(canTransition("pending", "ship")).toBe(false);
    expect(actorCan("tenant", "ship")).toBe(true);
    expect(actorCan("buyer", "ship")).toBe(false);
  });
});

describe("取消", () => {
  it("発送前だけ取り消せる", () => {
    expect(canTransition("pending", "cancel")).toBe(true);
    expect(canTransition("paid", "cancel")).toBe(true);
    // 発送後は返金の扱いになる
    expect(canTransition("shipped", "cancel")).toBe(false);
    expect(canTransition("completed", "cancel")).toBe(false);
  });

  it("購入者が取消を申請できるのは発送前だけ", () => {
    expect(canRequestCancel("pending")).toBe(true);
    expect(canRequestCancel("paid")).toBe(true);
    for (const status of ALL_STATUSES.filter((s) => s !== "pending" && s !== "paid")) {
      expect(canRequestCancel(status)).toBe(false);
    }
  });
});

describe("返金", () => {
  it("決済前には返金できない", () => {
    expect(canTransition("pending", "refund_full")).toBe(false);
    expect(canTransition("pending", "refund_partial")).toBe(false);
  });

  it("返金は発送後から。未発送なら取消で戻す", () => {
    // 決済済みの取消もお金は返るが、状態は cancelled にする。
    // 「届いたあとに返した」のと「そもそも届かなかった」を区別するため、
    // 同じ状況に 2 つの終わり方を作らない
    expect(canTransition("paid", "refund_partial")).toBe(false);
    expect(canTransition("paid", "refund_full")).toBe(false);
    expect(canTransition("paid", "cancel")).toBe(true);

    expect(canTransition("shipped", "refund_partial")).toBe(true);
    expect(canTransition("completed", "refund_partial")).toBe(true);
    expect(canTransition("shipped", "refund_full")).toBe(true);
  });

  it("一部返金のあとに全額返金へ進める", () => {
    expect(canTransition("partially_refunded", "refund_full")).toBe(true);
    expect(canTransition("partially_refunded", "refund_partial")).toBe(true);
  });

  it("購入者は自分で返金できない（申請はするが実行はしない）", () => {
    expect(actorCan("buyer", "refund_full")).toBe(false);
    expect(actorCan("buyer", "refund_partial")).toBe(false);
  });
});

describe("終端", () => {
  it("取消と全額返金からは動かない", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("refunded")).toBe(true);

    for (const action of ORDER_ACTIONS) {
      expect(canTransition("cancelled", action)).toBe(false);
      expect(canTransition("refunded", action)).toBe(false);
    }
  });

  it("それ以外は終端ではない", () => {
    for (const status of ["pending", "paid", "shipped", "completed", "partially_refunded"] as OrderStatus[]) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

describe("操作名の判定", () => {
  it("知らない文字列を受け付けない", () => {
    expect(isOrderAction("ship")).toBe(true);
    expect(isOrderAction("approve")).toBe(false);
    expect(isOrderAction("")).toBe(false);
  });
});

describe("立場ごとに出せる操作", () => {
  it("購入者は発送済みの注文を完了にできる", () => {
    expect(availableActions("shipped", "buyer")).toEqual(["complete"]);
  });

  it("購入者は決済済みの注文を取り消せる", () => {
    expect(availableActions("paid", "buyer")).toEqual(["cancel"]);
  });

  it("テナントは決済済みから発送と取消ができる", () => {
    expect(availableActions("paid", "tenant").sort()).toEqual(["cancel", "ship"]);
  });

  it("終端では誰も何もできない", () => {
    for (const actor of ["buyer", "tenant", "hq", "system"] as OrderActor[]) {
      expect(availableActions("cancelled", actor)).toEqual([]);
      expect(availableActions("refunded", actor)).toEqual([]);
    }
  });

  it("行き先がすべて定義されている", () => {
    for (const action of ORDER_ACTIONS) {
      expect(ALL_STATUSES).toContain(nextStatus(action));
    }
  });
});
