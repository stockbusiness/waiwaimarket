import { describe, expect, it } from "vitest";

import { basisPointsToPercentText } from "@/lib/points/labels";
import { BASIS_POINTS, parsePercent, parseRatio } from "@/lib/points/rules";

/**
 * 本部の設定画面が打った「％」を万分率へ直すところ（docs/02 6.1）。
 *
 * ここが下振れすると、**打った値より低い還元率が黙って保存される。**
 * 画面には保存した値が出るので、誰も気づけない。
 */

describe("parsePercent", () => {
  it("整数の％", () => {
    expect(parsePercent("1")).toBe(100);
    expect(parsePercent("50")).toBe(5000);
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent("100")).toBe(BASIS_POINTS);
  });

  it("小数第 2 位まで", () => {
    expect(parsePercent("1.5")).toBe(150);
    expect(parsePercent("0.25")).toBe(25);
    expect(parsePercent("0.01")).toBe(1);
  });

  it("浮動小数の下振れを起こさない", () => {
    // `Number("1.15") * 100` は 114.99999999999999。切り捨てると 1.14% になる。
    // 全域で確かめる（100 分の 1 刻みで 0〜100%）
    for (let basisPoints = 0; basisPoints <= BASIS_POINTS; basisPoints += 1) {
      const text = basisPointsToPercentText(basisPoints);
      expect(parsePercent(text)).toBe(basisPoints);
    }
  });

  it("読めない値は null", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("いち")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
    expect(parsePercent("1.5%")).toBeNull();
    // 万分率で表せない細かさ。切り捨てて 0% にしない
    expect(parsePercent("0.005")).toBeNull();
    // 100% を超える還元率は 0003 の検査制約も拒否する
    expect(parsePercent("101")).toBeNull();
  });

  it("前後の空白は落とす", () => {
    expect(parsePercent(" 1.5 ")).toBe(150);
  });
});

describe("basisPointsToPercentText", () => {
  it("保存された numeric から画面へ、画面から万分率へ、往復して変わらない", () => {
    // 0016 が入れる初期値（rate=0.0100、usage_cap_ratio=0.500）を通す
    const rate = parseRatio("0.0100");
    const cap = parseRatio("0.500");

    expect(basisPointsToPercentText(rate)).toBe("1");
    expect(basisPointsToPercentText(cap)).toBe("50");
    expect(parsePercent(basisPointsToPercentText(rate))).toBe(rate);
    expect(parsePercent(basisPointsToPercentText(cap))).toBe(cap);
  });
});
