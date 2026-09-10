import { describe, expect, it } from "vitest";

import { ConfigurationError } from "@/lib/supabase/env";
import { assertServiceRoleKey } from "@/lib/supabase/service-key";

const VAR = "SUPABASE_SERVICE_ROLE_KEY";

/** テスト用の JWT を組み立てる。署名は検証しないのでダミーでよい */
function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("assertServiceRoleKey", () => {
  it("新形式の Secret キーは通す", () => {
    const key = "sb_secret_abcdef0123456789";
    expect(assertServiceRoleKey(VAR, key)).toBe(key);
  });

  it("Publishable キーを取り違えていたら弾く", () => {
    expect(() => assertServiceRoleKey(VAR, "sb_publishable_abcdef0123456789")).toThrow(
      ConfigurationError,
    );
  });

  it("Publishable キーのときは変数名と対処方法を伝える", () => {
    try {
      assertServiceRoleKey(VAR, "sb_publishable_abcdef0123456789");
      throw new Error("例外が投げられませんでした");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const configurationError = error as ConfigurationError;
      expect(configurationError.variableName).toBe(VAR);
      expect(configurationError.message).toContain("Publishable");
      expect(configurationError.message).toContain("sb_secret_");
    }
  });

  it("Legacy の service_role キーは通す", () => {
    const key = jwt({ role: "service_role", iss: "supabase" });
    expect(assertServiceRoleKey(VAR, key)).toBe(key);
  });

  it("Legacy の anon キーを取り違えていたら弾く", () => {
    expect(() => assertServiceRoleKey(VAR, jwt({ role: "anon", iss: "supabase" }))).toThrow(
      ConfigurationError,
    );
  });

  it("弾いたときのメッセージにキーの値を含めない", () => {
    const key = jwt({ role: "anon", iss: "supabase" });
    try {
      assertServiceRoleKey(VAR, key);
      throw new Error("例外が投げられませんでした");
    } catch (error) {
      expect((error as Error).message).not.toContain(key);
    }
  });

  it("role クレームを持たない JWT は判定せず通す", () => {
    const key = jwt({ iss: "supabase" });
    expect(assertServiceRoleKey(VAR, key)).toBe(key);
  });

  it("判別できない形式は通す。キーの有効性を決めるのはサーバー側", () => {
    // SDK がまだ知らないキー形式を、こちらの都合で拒否してはいけない
    expect(assertServiceRoleKey(VAR, "sb_future_abcdef")).toBe("sb_future_abcdef");
    expect(assertServiceRoleKey(VAR, "not.a.jwt")).toBe("not.a.jwt");
  });
});
