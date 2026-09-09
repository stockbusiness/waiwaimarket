import { describe, expect, it } from "vitest";

import { buildAuditRow, normalizeIp } from "@/lib/audit/entry";

describe("buildAuditRow", () => {
  it("未指定の項目を null と空オブジェクトで埋める", () => {
    expect(
      buildAuditRow({ actorId: "u1", actorRole: "hq_admin", action: "tenant.approve" }),
    ).toEqual({
      actor_id: "u1",
      actor_role: "hq_admin",
      action: "tenant.approve",
      target_table: null,
      target_id: null,
      detail: {},
      ip: null,
    });
  });

  it("action が空なら組み立てを拒否する", () => {
    expect(() =>
      buildAuditRow({ actorId: null, actorRole: null, action: "   " }),
    ).toThrow();
  });

  it("理由と対象を保持する", () => {
    const row = buildAuditRow({
      actorId: "u1",
      actorRole: "hq_admin",
      action: "tenant.suspend",
      targetTable: "tenants",
      targetId: "t1",
      detail: { reason: "違反商品" },
    });
    expect(row.target_table).toBe("tenants");
    expect(row.detail).toEqual({ reason: "違反商品" });
  });
});

describe("normalizeIp", () => {
  it("X-Forwarded-For の先頭だけを採る", () => {
    expect(normalizeIp("203.0.113.1, 70.41.3.18")).toBe("203.0.113.1");
  });

  it("inet に入らない値は捨てる", () => {
    expect(normalizeIp("unknown")).toBeNull();
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });

  it("IPv6 を通す", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
  });
});
