import { describe, expect, it } from "vitest";

import { allocateEarn, earnedPoints } from "@/lib/points/earn";
import { BASIS_POINTS, parseRatio } from "@/lib/points/rules";

/**
 * 獲得ポイントの計算（docs/02 6.1）。
 *
 * 「購入時の獲得ポイント総数は、注文内の付与対象額合計に還元率を掛け、
 * 小数点以下を切り捨てて求める」
 *
 * 送料とポイント利用分は付与対象外（docs/02 6.1 の表）。この判定は
 * order_items.point_eligible_amount に入っている前提で、ここでは扱わない。
 */

/** 1% */
const BASE_RATE = 100;

function line(orderItemId: string, pointEligibleAmount: number) {
  return { orderItemId, pointEligibleAmount };
}

describe("還元率の読み取り", () => {
  it("numeric の文字列を万分率の整数にする", () => {
    // rate は numeric(5,4)。0.01 を浮動小数のまま扱うと
    // 0.1 や 0.08 と同じく誤差が出る（送料の税計算で踏んだ罠）
    expect(parseRatio("0.0100")).toBe(100);
    expect(parseRatio("0.0150")).toBe(150);
    expect(parseRatio("0.0001")).toBe(1);
    expect(parseRatio("1.0000")).toBe(BASIS_POINTS);
    expect(parseRatio("0")).toBe(0);
  });

  it("小数の桁数が違っても読める", () => {
    expect(parseRatio("0.01")).toBe(100);
    expect(parseRatio("0.5")).toBe(5000);
    expect(parseRatio("0.500")).toBe(5000);
  });

  it("数値で渡されても読める", () => {
    expect(parseRatio(0.01)).toBe(100);
    expect(parseRatio(0.5)).toBe(5000);
  });

  it("`Number(text) * 10000` では 1 万通りのうち 573 件がずれる", () => {
    // ここが浮動小数の本当の危険箇所。掛け算のほうは 200 万円まで調べても
    // 食い違いが出ないが、比率の読み取りは 0.0003 → 2 のように下振れする。
    // 文字列のまま桁を数えているので、全域で正しいことを固定しておく
    for (let bp = 0; bp <= BASIS_POINTS; bp += 1) {
      expect(parseRatio((bp / BASIS_POINTS).toFixed(4))).toBe(bp);
    }
  });

  it("万分率で表せない細かさは切り捨てる", () => {
    // numeric(5,4) は 0.0001 刻みなので本来は起きないが、
    // 想定外の値で黙って四捨五入しない
    expect(parseRatio("0.00005")).toBe(0);
  });

  it("範囲外は例外", () => {
    expect(() => parseRatio("-0.01")).toThrow();
    expect(() => parseRatio("1.5")).toThrow();
    expect(() => parseRatio("abc")).toThrow();
  });
});

describe("獲得ポイント総数", () => {
  it("付与対象額の合計に還元率を掛けて切り捨てる", () => {
    // 1,980 + 3,000 = 4,980。1% で 49.8 → 49
    expect(earnedPoints([line("a", 1980), line("b", 3000)], BASE_RATE)).toBe(49);
  });

  it("明細ごとに丸めない。取引単位で計算する", () => {
    // 明細ごとだと floor(19.8) + floor(30) = 19 + 30 = 49 で同じに見えるが、
    // 99 円の明細が 3 つだと明細ごとは 0 + 0 + 0 = 0、まとめると
    // floor(297 × 1%) = 2。税の計算と同じ理由で取引単位にする
    expect(earnedPoints([line("a", 99), line("b", 99), line("c", 99)], BASE_RATE)).toBe(2);
  });

  it("還元率 0 なら 0", () => {
    expect(earnedPoints([line("a", 100000)], 0)).toBe(0);
  });

  it("対象額が 0 なら 0", () => {
    expect(earnedPoints([line("a", 0), line("b", 0)], BASE_RATE)).toBe(0);
  });

  it("明細が無ければ 0", () => {
    expect(earnedPoints([], BASE_RATE)).toBe(0);
  });

  it("広い範囲で整数の割り算と一致する", () => {
    // 掛け算そのものは浮動小数でも 200 万円まで食い違いが出ないことを
    // 確認済み。それでも整数で計算するのは、還元率が変わっても、
    // 金額が大きくなっても理由を考え直さずに済ませるため
    for (const amount of [1, 99, 100, 700, 1100, 2900, 123456, 999999, 1999999]) {
      expect(earnedPoints([line("a", amount)], BASE_RATE)).toBe(Math.floor(amount / 100));
    }
  });
});

describe("明細への配分", () => {
  it("配分の合計は注文全体の付与数に一致する", () => {
    const lines = [line("a", 1980), line("b", 3000)];
    const total = earnedPoints(lines, BASE_RATE);
    const allocated = allocateEarn(lines, BASE_RATE);

    expect([...allocated.values()].reduce((s, v) => s + v, 0)).toBe(total);
  });

  it("端数は付与対象額の大きい明細ではなく、小数部分の大きい明細へ", () => {
    // 297 × 1% = 2.97 → 総数 2
    // 各明細 0.99 ずつ。整数部 0 を配って余り 2 を id 順の 2 明細へ
    const allocated = allocateEarn(
      [line("i1", 99), line("i2", 99), line("i3", 99)],
      BASE_RATE,
    );
    expect(allocated.get("i1")).toBe(1);
    expect(allocated.get("i2")).toBe(1);
    expect(allocated.get("i3")).toBe(0);
  });

  it("付与対象額が 0 の明細には配らない", () => {
    // ポイント値引きで対象額が 0 になった明細
    const allocated = allocateEarn([line("a", 0), line("b", 5000)], BASE_RATE);
    expect(allocated.get("a")).toBe(0);
    expect(allocated.get("b")).toBe(50);
  });

  it("再計算しても同じ結果になる", () => {
    const lines = [line("i2", 1234), line("i1", 5678), line("i3", 91011)];
    const first = allocateEarn(lines, BASE_RATE);
    expect(allocateEarn([...lines].reverse(), BASE_RATE)).toEqual(first);
  });
});
