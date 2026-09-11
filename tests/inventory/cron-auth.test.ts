import { describe, expect, it } from "vitest";

import { checkCronAuth } from "@/lib/http/cron-auth";

/**
 * バッチの入口は認証されたセッションを持たない。秘密鍵の一致だけが
 * 守りなので、抜け道が無いことをここで固定する。
 */

const SECRET = "s3cret-value-for-cron";

describe("checkCronAuth", () => {
  it("正しい Bearer を通す", () => {
    expect(checkCronAuth(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("秘密鍵が未設定なら not_configured。ok に倒さない", () => {
    // 倒すと、環境変数を入れ忘れた本番でバッチの経路が誰にでも開く
    expect(checkCronAuth(`Bearer ${SECRET}`, undefined)).toBe("not_configured");
    expect(checkCronAuth(`Bearer ${SECRET}`, "")).toBe("not_configured");
    expect(checkCronAuth(`Bearer ${SECRET}`, "   ")).toBe("not_configured");
  });

  it("ヘッダが無ければ拒む", () => {
    expect(checkCronAuth(null, SECRET)).toBe("unauthorized");
    expect(checkCronAuth("", SECRET)).toBe("unauthorized");
  });

  it("Bearer 以外の形式を拒む", () => {
    expect(checkCronAuth(SECRET, SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`bearer ${SECRET}`, SECRET)).toBe("unauthorized");
  });

  it("値が違えば拒む", () => {
    expect(checkCronAuth("Bearer wrong", SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe("unauthorized");
    expect(checkCronAuth("Bearer ", SECRET)).toBe("unauthorized");
  });

  it("前方一致では通さない", () => {
    // 長さの違いも差として数えていること
    expect(checkCronAuth("Bearer s", SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`Bearer ${SECRET}${SECRET}`, SECRET)).toBe("unauthorized");
  });

  it("設定値の前後の空白は無視する（貼り付け事故への備え）", () => {
    expect(checkCronAuth(`Bearer ${SECRET}`, `  ${SECRET}  `)).toBe("ok");
  });
});
