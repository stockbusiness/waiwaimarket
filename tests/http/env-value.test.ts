import { describe, expect, it } from "vitest";

import { ConfigurationError, required } from "@/lib/supabase/env";

const VAR = "STRIPE_SECRET_KEY";

/** 例外を取り出す。投げられなければテストを失敗させる */
function capture(value: string): ConfigurationError {
  try {
    required(VAR, value);
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error("例外が投げられませんでした");
}

describe("required の値検証", () => {
  it("前後の空白と改行を落とす", () => {
    expect(required(VAR, "  sk_test_abc\n")).toBe("sk_test_abc");
    expect(required(VAR, "\r\nsk_test_abc\r\n")).toBe("sk_test_abc");
  });

  it("空白だけの値は未設定として扱う", () => {
    expect(() => required(VAR, "   \n")).toThrow(ConfigurationError);
  });

  it("値の途中の改行は弾く。これが Stripe の接続エラーの正体だった", () => {
    const error = capture("sk_test_abc\ndef");
    expect(error.variableName).toBe(VAR);
    expect(error.message).toContain("制御文字");
    expect(error.message).toContain("12 文字目");
  });

  it("全角文字を弾く", () => {
    const error = capture("sk_test_ａbc");
    expect(error.message).toContain("ASCII 以外");
    expect(error.message).toContain("9 文字目");
  });

  it("弾いたときのメッセージに値を含めない", () => {
    expect(capture("sk_test_secret\nvalue").message).not.toContain("sk_test_secret");
  });

  it("正常な値はそのまま返す", () => {
    expect(required(VAR, "sk_test_51AbCdEf")).toBe("sk_test_51AbCdEf");
    expect(required("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")).toBe(
      "https://x.supabase.co",
    );
  });
});
