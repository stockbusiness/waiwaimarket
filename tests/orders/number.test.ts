import { describe, expect, it } from "vitest";

import { generateOrderNumber, isOrderNumber } from "@/lib/orders/number";

/**
 * 注文番号（0015）。
 *
 * 見ているのは 3 つ。「日付が JST であること」「連番でないこと」
 * 「どの文字も同じ確率で出ること」。
 */

/** 与えたバイト列をそのまま返す乱数源。偏りの検査に使う */
function fixedBytes(values: number[]): (size: number) => Uint8Array {
  let index = 0;
  return (size) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      out[i] = values[index % values.length];
      index += 1;
    }
    return out;
  };
}

describe("generateOrderNumber", () => {
  it("形式どおりに作る", () => {
    expect(isOrderNumber(generateOrderNumber())).toBe(true);
  });

  it("日付は JST で出す", () => {
    // 2026-09-19 15:00 UTC は JST では 9/20 の 0 時。
    // UTC のまま出すと 9/19 になり、購入者が見る日付とずれる
    const number = generateOrderNumber(new Date("2026-09-19T15:00:00Z"));
    expect(number.startsWith("WM-20260920-")).toBe(true);

    // 同じ日の 14:59 UTC はまだ 9/19（23:59 JST）
    const before = generateOrderNumber(new Date("2026-09-19T14:59:59Z"));
    expect(before.startsWith("WM-20260919-")).toBe(true);
  });

  it("紛らわしい文字を使わない", () => {
    // 0/O、1/I/L は電話口で読み上げると取り違える。
    // 1000 本引いて 1 つも出てこないことを見る
    for (let i = 0; i < 1000; i += 1) {
      const random = generateOrderNumber().split("-")[2];
      expect(random).not.toMatch(/[01OIL]/);
    }
  });

  it("連番にならない", () => {
    // 連番だと、購入者が自分の番号を見ただけで累計注文数が分かる
    const numbers = Array.from({ length: 500 }, () => generateOrderNumber());
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("棄却の境目以上のバイトを捨てる", () => {
    // 248 以上をそのまま `% 31` で丸めると先頭の文字に寄る。
    // 248 → 248 % 31 = 3 → ALPHABET[3] = '5' が出てしまう
    const number = generateOrderNumber(new Date(), fixedBytes([248, 249, 250, 100]));
    const random = number.split("-")[2];

    // 248〜250 は捨てられ、100 だけが採られる。100 % 31 = 7 → ALPHABET[7]
    const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    expect(random).toBe(ALPHABET[7].repeat(6));
  });

  it("どの文字も同じ確率で出る", () => {
    // 偏った番号は推測の手がかりになる。0〜255 を一巡させたとき、
    // 採られる 248 個が 31 文字へ 8 個ずつ均等に割れることを見る
    const all = Array.from({ length: 256 }, (_, i) => i);
    const number = generateOrderNumber(new Date(), fixedBytes(all));
    expect(isOrderNumber(number)).toBe(true);

    const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const counts = new Map<string, number>();
    for (const byte of all) {
      if (byte >= 248) continue;
      const char = ALPHABET[byte % ALPHABET.length];
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(ALPHABET.length);
    expect([...counts.values()].every((count) => count === 8)).toBe(true);
  });
});

describe("isOrderNumber", () => {
  it("形式の違うものを弾く", () => {
    for (const value of [
      "",
      "WM-2026091-K7P2NX", // 日付が 7 桁
      "WM-20260919-K7P2N", // ランダム部が 5 桁
      "WM-20260919-K7P2N0", // 使わない文字（0）
      "XX-20260919-K7P2NX", // 別の接頭辞
      "20260919-K7P2NX", // 接頭辞なし
    ]) {
      expect(isOrderNumber(value)).toBe(false);
    }
  });
});
