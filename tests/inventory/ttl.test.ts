import { describe, expect, it } from "vitest";

import {
  RESERVATION_TTL_MINUTES,
  formatRemaining,
  isExpired,
  remainingMs,
} from "@/lib/inventory/ttl";

const NOW = new Date("2026-09-11T12:00:00Z");

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

describe("TTL", () => {
  it("15 分（docs/06 4.2、CLAUDE.md 全般ルール）", () => {
    expect(RESERVATION_TTL_MINUTES).toBe(15);
  });
});

describe("isExpired", () => {
  it("過ぎていれば切れている", () => {
    expect(isExpired(at(-1), NOW)).toBe(true);
  });

  it("先ならまだ切れていない", () => {
    expect(isExpired(at(1), NOW)).toBe(false);
  });

  it("ちょうど 0 秒は切れている扱い（DB の <= と揃える）", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });
});

describe("remainingMs", () => {
  it("残りを返す", () => {
    expect(remainingMs(at(60_000), NOW)).toBe(60_000);
  });

  it("切れていれば 0。負の数にしない", () => {
    expect(remainingMs(at(-60_000), NOW)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("秒は切り上げる", () => {
    // 「あと 0 分」と出してからまだ 50 秒使える、という食い違いを避ける
    expect(formatRemaining(at(50_000), NOW)).toBe("あと 1 分");
    expect(formatRemaining(at(60_001), NOW)).toBe("あと 2 分");
  });

  it("ちょうどの分はそのまま", () => {
    expect(formatRemaining(at(15 * 60_000), NOW)).toBe("あと 15 分");
  });

  it("切れていれば期限切れ", () => {
    expect(formatRemaining(at(-1), NOW)).toBe("期限切れ");
    expect(formatRemaining(NOW, NOW)).toBe("期限切れ");
  });
});
