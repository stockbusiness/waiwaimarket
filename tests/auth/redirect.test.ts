import { describe, expect, it } from "vitest";

import { resolveNextPath } from "@/lib/auth/redirect";

describe("resolveNextPath", () => {
  it("面の配下ならそのまま使う", () => {
    expect(resolveNextPath("tenant", "/tenant/products")).toBe("/tenant/products");
    expect(resolveNextPath("hq", "/admin/tenants/1")).toBe("/admin/tenants/1");
  });

  it("面の外を指す next は既定の遷移先へ落とす", () => {
    expect(resolveNextPath("tenant", "/admin/tenants")).toBe("/tenant");
    expect(resolveNextPath("hq", "/tenant")).toBe("/admin");
  });

  it("外部サイトへ飛ばさない", () => {
    for (const evil of [
      "//evil.example.com",
      "https://evil.example.com",
      "/\\evil.example.com",
      "/tenant\\..\\admin",
    ]) {
      expect(resolveNextPath("tenant", evil)).toBe("/tenant");
      expect(resolveNextPath("buyer", evil)).toBe("/");
    }
  });

  it("ログイン画面へ戻して堂々巡りにしない", () => {
    expect(resolveNextPath("tenant", "/tenant/login")).toBe("/tenant");
  });

  it("next が無ければ既定の遷移先", () => {
    expect(resolveNextPath("buyer", null)).toBe("/");
    expect(resolveNextPath("hq", undefined)).toBe("/admin");
  });

  it("接頭辞が同じだけの経路は通さない", () => {
    expect(resolveNextPath("tenant", "/tenants/secret")).toBe("/tenant");
  });
});
