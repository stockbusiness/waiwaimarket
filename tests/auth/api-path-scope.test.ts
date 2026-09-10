import { describe, expect, it } from "vitest";

import {
  AUDIENCES,
  AUDIENCE_CONFIG,
  audienceApiPath,
  cookieReachesPath,
  isApiPath,
  type Audience,
} from "@/lib/supabase/audience";

/**
 * 面ごとに cookie の path を分けているため、その面の API も同じ path 配下に
 * 置かないと認証 cookie が送られない。
 *
 * 実際に /api/tenant/application に置いてしまい、画面は開けるのに API だけが
 * 常に 401 になるという不具合を出した。疎通確認の「未認証を 401 で弾く」は
 * PASS したままだったので気づけなかった。同じ取り違えを防ぐためのテスト。
 */

/** 画面から呼んでいる API。増やしたらここにも足す */
const CLIENT_API_CALLS: { audience: Audience; subPath: string }[] = [
  { audience: "tenant", subPath: "application" },
  { audience: "tenant", subPath: "store" },
  { audience: "tenant", subPath: "legal-profile" },
  { audience: "tenant", subPath: "onboarding/stripe" },
  { audience: "hq", subPath: "tenants/00000000-0000-4000-8000-000000000000/review" },
];

describe("API の経路が cookie の scope に入っていること", () => {
  it.each(CLIENT_API_CALLS)(
    "$audience の $subPath に認証 cookie が届く",
    ({ audience, subPath }) => {
      const path = audienceApiPath(audience, subPath);
      expect(cookieReachesPath(audience, path)).toBe(true);
    },
  );

  it("旧経路には cookie が届かない（これが不具合の原因だった）", () => {
    expect(cookieReachesPath("tenant", "/api/tenant/application")).toBe(false);
    expect(cookieReachesPath("hq", "/api/admin/tenants/x/review")).toBe(false);
  });

  it("他の面の cookie は届かない", () => {
    const tenantApi = audienceApiPath("tenant", "application");
    expect(cookieReachesPath("hq", tenantApi)).toBe(false);

    const hqApi = audienceApiPath("hq", "tenants/x/review");
    expect(cookieReachesPath("tenant", hqApi)).toBe(false);
  });

  it("画面の経路にも届く", () => {
    expect(cookieReachesPath("tenant", "/tenant")).toBe(true);
    expect(cookieReachesPath("tenant", "/tenant/apply")).toBe(true);
    expect(cookieReachesPath("tenant", "/tenant/auth/callback")).toBe(true);
    expect(cookieReachesPath("hq", "/admin/tenants")).toBe(true);
  });

  it("接頭辞が同じだけの経路には届かない", () => {
    expect(cookieReachesPath("tenant", "/tenants")).toBe(false);
    expect(cookieReachesPath("hq", "/administrator")).toBe(false);
  });
});

describe("audienceApiPath", () => {
  it("面ごとの path 配下に組み立てる", () => {
    expect(audienceApiPath("tenant", "application")).toBe("/tenant/api/application");
    expect(audienceApiPath("hq", "tenants/1/review")).toBe("/admin/api/tenants/1/review");
    expect(audienceApiPath("buyer", "cart/items")).toBe("/api/cart/items");
  });

  it("先頭のスラッシュがあってもなくても同じ", () => {
    expect(audienceApiPath("tenant", "/store")).toBe(audienceApiPath("tenant", "store"));
  });

  it("すべての面で自分の cookie が届く経路になる", () => {
    for (const audience of AUDIENCES) {
      const path = audienceApiPath(audience, "example");
      expect(cookieReachesPath(audience, path)).toBe(true);
      expect(path.startsWith(AUDIENCE_CONFIG[audience].cookiePath)).toBe(true);
    }
  });
});

describe("isApiPath", () => {
  it("API の経路を判別する（proxy がリダイレクトしないため）", () => {
    expect(isApiPath("/tenant/api/application")).toBe(true);
    expect(isApiPath("/admin/api/tenants/1/review")).toBe(true);
    expect(isApiPath("/api/webhooks/stripe")).toBe(true);
  });

  it("画面の経路は API ではない", () => {
    expect(isApiPath("/tenant/apply")).toBe(false);
    expect(isApiPath("/admin/tenants")).toBe(false);
  });
});
