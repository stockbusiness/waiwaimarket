import { describe, expect, it } from "vitest";

import {
  AUDIENCES,
  AUDIENCE_CONFIG,
  audienceForPath,
  isAudience,
  isPublicAuthPath,
} from "@/lib/supabase/audience";

describe("面の分離", () => {
  it("cookie 名が面ごとに異なる", () => {
    const names = AUDIENCES.map((a) => AUDIENCE_CONFIG[a].cookieName);
    expect(new Set(names).size).toBe(AUDIENCES.length);
  });

  it("テナントと本部の cookie は自分の path 配下にしか送られない", () => {
    expect(AUDIENCE_CONFIG.tenant.cookiePath).toBe("/tenant");
    expect(AUDIENCE_CONFIG.hq.cookiePath).toBe("/admin");
    expect(AUDIENCE_CONFIG.buyer.cookiePath).toBe("/");
  });

  it("認証コールバックが各面の path 配下にある", () => {
    // PKCE の code verifier cookie が同じ scope に入る必要がある
    expect(AUDIENCE_CONFIG.tenant.callbackPath.startsWith("/tenant/")).toBe(true);
    expect(AUDIENCE_CONFIG.hq.callbackPath.startsWith("/admin/")).toBe(true);
    expect(AUDIENCE_CONFIG.buyer.callbackPath).toBe("/auth/callback");
  });
});

describe("audienceForPath", () => {
  it.each([
    ["/admin", "hq"],
    ["/admin/tenants/1", "hq"],
    ["/tenant", "tenant"],
    ["/tenant/login", "tenant"],
    ["/", "buyer"],
    ["/login", "buyer"],
    ["/stores/abc", "buyer"],
  ])("%s は %s", (path, expected) => {
    expect(audienceForPath(path)).toBe(expected);
  });

  it("前方一致だけで誤判定しない", () => {
    expect(audienceForPath("/administrator")).toBe("buyer");
    expect(audienceForPath("/tenants")).toBe("buyer");
  });
});

describe("isPublicAuthPath", () => {
  it.each([
    "/login",
    "/auth/callback",
    "/tenant/login",
    "/tenant/auth/callback",
    "/admin/login",
    "/admin/auth/callback",
  ])("%s はログイン不要", (path) => {
    expect(isPublicAuthPath(path)).toBe(true);
  });

  it.each(["/tenant", "/tenant/products", "/admin", "/admin/tenants"])(
    "%s はログインが要る",
    (path) => {
      expect(isPublicAuthPath(path)).toBe(false);
    },
  );
});

describe("isAudience", () => {
  it("既知の面だけを通す", () => {
    expect(isAudience("hq")).toBe(true);
    expect(isAudience("admin")).toBe(false);
  });
});
