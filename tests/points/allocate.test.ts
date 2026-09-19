import { describe, expect, it } from "vitest";

import { largestRemainder } from "@/lib/points/allocate";

/**
 * 最大剰余方式の配分（docs/02 6.1）。
 *
 * 「各明細には明細金額に還元率を掛けた整数部分を先に割り当て、注文全体との差を
 * 小数部分が大きい明細から1ポイントずつ配分する。同率の場合は order_item_id 順と
 * し、再計算しても同じ結果になるようにする」
 *
 * **決定性がいちばん大事。** 再計算で結果が変わると、返品のときに
 * 「何ポイント付与していたか」が合わなくなる。
 */

function w(id: string, weight: number) {
  return { id, weight };
}

describe("最大剰余方式", () => {
  it("配分の合計は必ず総数に一致する", () => {
    const result = largestRemainder(10, [w("a", 1), w("b", 1), w("c", 1)]);
    expect([...result.values()].reduce((s, v) => s + v, 0)).toBe(10);
  });

  it("割り切れるときは比率どおり", () => {
    const result = largestRemainder(6, [w("a", 1), w("b", 2)]);
    expect(result.get("a")).toBe(2);
    expect(result.get("b")).toBe(4);
  });

  it("端数は小数部分の大きいものから 1 ずつ配る", () => {
    // 10 を 1:1:1 で割ると 3.333... ずつ。整数部 3 を配って余り 1。
    // 小数部は同率なので id 順（a）に 1 を足す
    const result = largestRemainder(10, [w("a", 1), w("b", 1), w("c", 1)]);
    expect(result.get("a")).toBe(4);
    expect(result.get("b")).toBe(3);
    expect(result.get("c")).toBe(3);
  });

  it("小数部分が大きいほうが先に取る", () => {
    // 総数 10、重み 1:6:3 → 1, 6, 3 ちょうど
    // 総数 11、重み 1:6:3 → 1.1, 6.6, 3.3 → 整数部 1,6,3 で余り 1。
    // 小数部は 0.6 が最大なので b が取る
    const result = largestRemainder(11, [w("a", 1), w("b", 6), w("c", 3)]);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(7);
    expect(result.get("c")).toBe(3);
  });

  it("同率なら id 順。入力の順序では決まらない", () => {
    const forward = largestRemainder(10, [w("a", 1), w("b", 1), w("c", 1)]);
    const reverse = largestRemainder(10, [w("c", 1), w("b", 1), w("a", 1)]);
    expect([...reverse.entries()].sort()).toEqual([...forward.entries()].sort());
    // 入力順の先頭ではなく、id が小さいほうが取る
    expect(reverse.get("a")).toBe(4);
  });

  it("何度計算しても同じ結果になる", () => {
    const items = [w("i3", 7), w("i1", 7), w("i2", 7), w("i4", 7)];
    const first = largestRemainder(10, items);
    for (let i = 0; i < 5; i += 1) {
      expect(largestRemainder(10, items)).toEqual(first);
    }
  });

  it("重みが 0 の明細には配らない", () => {
    // 送料だけの明細やポイント値引きで対象額が 0 になった明細
    const result = largestRemainder(10, [w("a", 0), w("b", 5)]);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(10);
  });

  it("総数が 0 なら全員 0", () => {
    const result = largestRemainder(0, [w("a", 3), w("b", 5)]);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });

  it("重みの合計が 0 なら配らない", () => {
    // 付与対象額が全部 0。総数も 0 のはずだが、呼び方を誤っても落ちないこと
    const result = largestRemainder(5, [w("a", 0), w("b", 0)]);
    expect([...result.values()]).toEqual([0, 0]);
  });

  it("明細が 1 つならすべてそこへ", () => {
    expect(largestRemainder(7, [w("a", 3)]).get("a")).toBe(7);
  });

  it("明細が無ければ空", () => {
    expect(largestRemainder(7, []).size).toBe(0);
  });

  it("乱数 1000 通りでも合計が一致し、順序に依存しない", () => {
    // 実際の注文は明細数も金額もまちまちで、手で並べた例だけでは
    // 端数の取り合いを網羅できない
    let seed = 12345;
    const rand = (max: number) => {
      // 線形合同法。テストを再現可能にするため Math.random を使わない
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };

    for (let round = 0; round < 1000; round += 1) {
      const count = 1 + rand(8);
      const items = Array.from({ length: count }, (_, i) =>
        w(`item-${String(i).padStart(2, "0")}`, rand(50_000)),
      );
      const total = rand(5_000);

      const result = largestRemainder(total, items);
      const sum = [...result.values()].reduce((s, v) => s + v, 0);

      const weightSum = items.reduce((s, item) => s + item.weight, 0);
      expect(sum).toBe(weightSum === 0 ? 0 : total);

      // 誰も負にならない
      for (const value of result.values()) expect(value).toBeGreaterThanOrEqual(0);

      // 入力順を変えても同じ
      const shuffled = [...items].reverse();
      expect(largestRemainder(total, shuffled)).toEqual(result);
    }
  });
});
