import { describe, expect, it } from "vitest";

import { consumeFifo, usageCap, checkSpend } from "@/lib/points/spend";

/**
 * ポイント利用（docs/02 6.1、6.3）。
 *
 * 「注文ごとに商品代金（税込・送料除く）の50％まで。全額ポイント購入は不可」
 * 「対象ロットを期限の近い順に予約」
 */

/** 50% */
const CAP = 5000;

function lot(id: string, remainingPoints: number, expiresAt: string) {
  return { id, remainingPoints, expiresAt };
}

describe("利用上限", () => {
  it("商品代金の 50%。端数は切り捨て", () => {
    expect(usageCap(10000, CAP)).toBe(5000);
    // 4,999 の 50% は 2,499.5 → 2,499。切り上げると上限を超える
    expect(usageCap(4999, CAP)).toBe(2499);
  });

  it("送料は含まない", () => {
    // 呼び出し側が送料を除いた額を渡す。ここでは受け取った額で計算する
    expect(usageCap(3000, CAP)).toBe(1500);
  });

  it("上限比率を変えられる（管理画面から変更可能、docs/02 6.1）", () => {
    expect(usageCap(10000, 3000)).toBe(3000);
    expect(usageCap(10000, 10000)).toBe(10000);
  });

  it("商品代金 0 なら 0", () => {
    expect(usageCap(0, CAP)).toBe(0);
  });
});

describe("利用の可否", () => {
  const base = { subtotalInclTax: 10000, shippingFee: 500, availableBalance: 9999, usageCapBasisPoints: CAP };

  it("上限ちょうどは通す", () => {
    expect(checkSpend({ ...base, requested: 5000 })).toBe("ok");
  });

  it("上限を 1 ポイント超えたら拒否", () => {
    expect(checkSpend({ ...base, requested: 5001 })).toBe("exceeds_cap");
  });

  it("残高を超えたら拒否", () => {
    expect(checkSpend({ ...base, availableBalance: 100, requested: 200 })).toBe(
      "insufficient_balance",
    );
  });

  it("0 ポイントの利用は「使わない」として通す", () => {
    expect(checkSpend({ ...base, requested: 0 })).toBe("ok");
  });

  it("負のポイントは拒否", () => {
    expect(checkSpend({ ...base, requested: -1 })).toBe("invalid");
  });

  it("残高がマイナスのあいだは利用できない（docs/02 6.4）", () => {
    // 反対取引で残高がマイナスになった購入者。次回付与で相殺されるまで停止
    expect(checkSpend({ ...base, availableBalance: -50, requested: 1 })).toBe(
      "negative_balance",
    );
    // 0 ポイント（使わない）は通す
    expect(checkSpend({ ...base, availableBalance: -50, requested: 0 })).toBe("ok");
  });

  it("円決済が 0 円になる利用は拒否する（docs/02 6.1）", () => {
    // 上限 50% があるので通常は起きないが、上限を 100% に変えた場合に
    // 全額ポイント購入が成立してしまう。決済アダプターに特殊経路を
    // 持たせないため、円決済は必ず 1 円以上にする（0003 の制約と揃える）
    expect(
      checkSpend({
        subtotalInclTax: 1000,
        shippingFee: 0,
        availableBalance: 5000,
        usageCapBasisPoints: 10000,
        requested: 1000,
      }),
    ).toBe("no_cash_remaining");

    // 1 円残れば通る
    expect(
      checkSpend({
        subtotalInclTax: 1000,
        shippingFee: 0,
        availableBalance: 5000,
        usageCapBasisPoints: 10000,
        requested: 999,
      }),
    ).toBe("ok");
  });

  it("送料があれば全額ポイントでも円が残る", () => {
    expect(
      checkSpend({
        subtotalInclTax: 1000,
        shippingFee: 500,
        availableBalance: 5000,
        usageCapBasisPoints: 10000,
        requested: 1000,
      }),
    ).toBe("ok");
  });
});

describe("ロットの消費（FIFO）", () => {
  it("期限の近いロットから使う", () => {
    const lots = [
      lot("late", 100, "2027-12-01T00:00:00Z"),
      lot("soon", 100, "2026-10-01T00:00:00Z"),
      lot("mid", 100, "2027-01-01T00:00:00Z"),
    ];
    const result = consumeFifo(lots, 150);
    expect(result).toEqual([
      { lotId: "soon", points: 100 },
      { lotId: "mid", points: 50 },
    ]);
  });

  it("ちょうど使い切る", () => {
    const lots = [lot("a", 100, "2026-10-01T00:00:00Z")];
    expect(consumeFifo(lots, 100)).toEqual([{ lotId: "a", points: 100 }]);
  });

  it("残量が足りなければ null。部分的に取らない", () => {
    // 足りないのに 2 ロットだけ押さえると、その分が他で使えなくなる
    const lots = [lot("a", 100, "2026-10-01T00:00:00Z")];
    expect(consumeFifo(lots, 101)).toBeNull();
  });

  it("0 ポイントなら何も消費しない", () => {
    expect(consumeFifo([lot("a", 100, "2026-10-01T00:00:00Z")], 0)).toEqual([]);
  });

  it("残量 0 のロットは飛ばす", () => {
    const lots = [
      lot("empty", 0, "2026-09-01T00:00:00Z"),
      lot("has", 50, "2026-10-01T00:00:00Z"),
    ];
    expect(consumeFifo(lots, 50)).toEqual([{ lotId: "has", points: 50 }]);
  });

  it("期限が同じなら id 順。再計算しても同じ結果になる", () => {
    const lots = [
      lot("b", 30, "2026-10-01T00:00:00Z"),
      lot("a", 30, "2026-10-01T00:00:00Z"),
    ];
    expect(consumeFifo(lots, 40)).toEqual([
      { lotId: "a", points: 30 },
      { lotId: "b", points: 10 },
    ]);
    // 入力順を変えても同じ
    expect(consumeFifo([...lots].reverse(), 40)).toEqual(consumeFifo(lots, 40));
  });

  it("ロットが無ければ、0 ポイント以外は null", () => {
    expect(consumeFifo([], 0)).toEqual([]);
    expect(consumeFifo([], 1)).toBeNull();
  });

  it("負のポイントは null", () => {
    expect(consumeFifo([lot("a", 100, "2026-10-01T00:00:00Z")], -1)).toBeNull();
  });
});
