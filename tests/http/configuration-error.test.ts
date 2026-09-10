import { describe, expect, it } from "vitest";

import { ConfigurationError, required } from "@/lib/supabase/env";

describe("ConfigurationError", () => {
  it("未設定なら変数名を持った例外を投げる", () => {
    try {
      required("SUPABASE_SERVICE_ROLE_KEY", undefined);
      throw new Error("例外が投げられませんでした");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).variableName).toBe("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("空文字も未設定として扱う", () => {
    expect(() => required("X", "")).toThrow(ConfigurationError);
  });

  it("値があればそのまま返す", () => {
    expect(required("X", "value")).toBe("value");
  });

  it("通常の Error と区別できる", () => {
    expect(new Error("boom") instanceof ConfigurationError).toBe(false);
  });
});
