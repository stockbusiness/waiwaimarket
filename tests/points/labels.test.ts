import { describe, expect, it } from "vitest";

import { formatBasisPoints, formatDelta, formatPoints } from "@/lib/points/labels";

/**
 * ポイントの表示（docs/02 6.1・6.2）。
 *
 * 計算が合っていても、出し方を間違えると購入者は取り違える。
 * 「0 に符号を付けない」「指数表記にしない」をここで止める。
 */

describe("formatBasisPoints", () => {
  it("初期値をそのまま出せる", () => {
    expect(formatBasisPoints(100)).toBe("1%");
    expect(formatBasisPoints(5000)).toBe("50%");
  });

  it("端数のある比率も読める形で出す", () => {
    expect(formatBasisPoints(25)).toBe("0.25%");
    expect(formatBasisPoints(150)).toBe("1.5%");
    expect(formatBasisPoints(1)).toBe("0.01%");
  });

  it("0 と 100% の両端", () => {
    expect(formatBasisPoints(0)).toBe("0%");
    expect(formatBasisPoints(10_000)).toBe("100%");
  });

  it("指数表記にならない", () => {
    // `3 / 10000` を文字にすると "0.0003" だが、より小さい値では
    // JavaScript が "3e-7" のような表記を出す。整数のまま組み立てて避ける
    for (let bp = 0; bp <= 10_000; bp += 1) {
      expect(formatBasisPoints(bp)).not.toMatch(/e/i);
    }
  });

  it("どの値でも % で終わる", () => {
    for (let bp = 0; bp <= 10_000; bp += 7) {
      expect(formatBasisPoints(bp).endsWith("%")).toBe(true);
    }
  });
});

describe("formatDelta", () => {
  it("増減に符号を付ける", () => {
    expect(formatDelta(120)).toBe("+120");
    expect(formatDelta(-120)).toBe("−120");
  });

  it("0 には符号を付けない", () => {
    // 取り消しの差引が 0 になる行で「+0」と出ると、何かが増えたように読める
    expect(formatDelta(0)).toBe("0");
  });

  it("桁区切りを入れる", () => {
    expect(formatDelta(12_345)).toBe("+12,345");
  });
});

describe("formatPoints", () => {
  it("単位は日本語", () => {
    expect(formatPoints(1200)).toBe("1,200 ポイント");
    expect(formatPoints(0)).toBe("0 ポイント");
  });

  it("マイナス残高もそのまま出す", () => {
    // docs/02 6.4「残高をマイナスのまま記録し、次回付与で相殺する」。
    // 画面で 0 に丸めると、購入者は次の付与が消えた理由が分からない
    expect(formatPoints(-50)).toBe("-50 ポイント");
  });
});
