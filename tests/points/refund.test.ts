import { describe, expect, it } from "vitest";

import { refundEarned, refundUsedPoints } from "@/lib/points/refund";

/**
 * 返品・返金時の再計算（docs/02 6.4）。
 *
 * 「注文に使用したポイントは、point_usage_allocations に保存した明細別・
 * ロット別の使用数を基に返還する。割合計算だけで推定しない。数量の一部を
 * 返品する場合は、対象数量の比率を基に整数計算し、端数は同じ最大剰余方式で
 * 決定する」
 */

function used(lotId: string, points: number) {
  return { lotId, points };
}

describe("利用ポイントの返還", () => {
  it("全数量を返品したら使った分がそのまま戻る", () => {
    // 端数の計算を挟んで 1 ポイント減る、ということがあってはいけない
    const result = refundUsedPoints([used("a", 70), used("b", 33)], 3, 3);
    expect(result.get("a")).toBe(70);
    expect(result.get("b")).toBe(33);
  });

  it("元のロットごとに返す。割合で推定しない", () => {
    // 2 ロットにまたがって使った 100 ポイントのうち半分を返す
    const result = refundUsedPoints([used("a", 60), used("b", 40)], 1, 2);
    expect(result.get("a")).toBe(30);
    expect(result.get("b")).toBe(20);
    expect([...result.values()].reduce((s, v) => s + v, 0)).toBe(50);
  });

  it("端数は最大剰余方式でロットへ配る", () => {
    // 使用 100 ポイント、3 個のうち 1 個を返品 → 100 × 1/3 = 33.33 → 33
    // ロットの使用比は 60:40 なので 19.8 : 13.2 → 整数部 19,13 で余り 1。
    // 小数部の大きい a が取る
    const result = refundUsedPoints([used("a", 60), used("b", 40)], 1, 3);
    expect([...result.values()].reduce((s, v) => s + v, 0)).toBe(33);
    expect(result.get("a")).toBe(20);
    expect(result.get("b")).toBe(13);
  });

  it("繰り返し返品しても使った分を超えない", () => {
    // 3 個のうち 1 個ずつ 3 回返品する。合計が 100 を超えたら
    // 存在しないポイントを返したことになる
    const usedPoints = [used("a", 60), used("b", 40)];
    let refunded = 0;
    let remainingQty = 3;
    for (let i = 0; i < 3; i += 1) {
      const result = refundUsedPoints(usedPoints, 1, remainingQty);
      const sum = [...result.values()].reduce((s, v) => s + v, 0);
      refunded += sum;
      // 返した分を差し引いて次へ
      for (const entry of usedPoints) {
        entry.points -= result.get(entry.lotId) ?? 0;
      }
      remainingQty -= 1;
    }
    expect(refunded).toBe(100);
    expect(usedPoints.every((entry) => entry.points === 0)).toBe(true);
  });

  it("0 個の返品なら 0", () => {
    const result = refundUsedPoints([used("a", 60)], 0, 3);
    expect(result.get("a")).toBe(0);
  });

  it("使っていなければ 0", () => {
    expect(refundUsedPoints([], 1, 3).size).toBe(0);
  });

  it("返品数量が注文数量を超えたら例外", () => {
    // 呼び出し側の誤り。黙って全部返すと帳尻が合わなくなる
    expect(() => refundUsedPoints([used("a", 60)], 4, 3)).toThrow();
  });

  it("注文数量 0 は例外", () => {
    expect(() => refundUsedPoints([used("a", 60)], 0, 0)).toThrow();
  });
});

describe("付与ポイントの取消", () => {
  it("全数量を返品したら付与した分がそのまま取り消される", () => {
    expect(refundEarned(49, 3, 3)).toBe(49);
  });

  it("数量の比率で整数計算し、切り捨てる", () => {
    // 49 ポイント、3 個のうち 1 個 → 16.33 → 16
    expect(refundEarned(49, 1, 3)).toBe(16);
    expect(refundEarned(49, 2, 3)).toBe(32);
  });

  it("繰り返し返品しても付与した分を超えて取り消さない", () => {
    // 1 個ずつ 3 回。16 + 16 + 17 = 49
    let granted = 49;
    let remainingQty = 3;
    let reversed = 0;
    for (let i = 0; i < 3; i += 1) {
      const amount = refundEarned(granted, 1, remainingQty);
      reversed += amount;
      granted -= amount;
      remainingQty -= 1;
    }
    expect(reversed).toBe(49);
    expect(granted).toBe(0);
  });

  it("付与が 0 なら 0", () => {
    expect(refundEarned(0, 1, 3)).toBe(0);
  });

  it("範囲外は例外", () => {
    expect(() => refundEarned(49, 4, 3)).toThrow();
    expect(() => refundEarned(49, 1, 0)).toThrow();
    expect(() => refundEarned(-1, 1, 3)).toThrow();
  });
});
