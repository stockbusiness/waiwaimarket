import { describe, expect, it } from "vitest";

import {
  canActAsTenantMember,
  canActAsTenantOwner,
  findMembership,
  isHqAdmin,
  isHqOperator,
  parseHqRole,
  satisfiesHqAdminAssurance,
  type TenantMembership,
} from "@/lib/auth/roles";

const memberships: TenantMembership[] = [
  { tenantId: "t-owner", role: "owner" },
  { tenantId: "t-staff", role: "staff" },
];

describe("本部の役割", () => {
  it("本部管理者はオペレーターの範囲も含む", () => {
    expect(isHqOperator("hq_admin")).toBe(true);
    expect(isHqOperator("hq_operator")).toBe(true);
    expect(isHqOperator(null)).toBe(false);
  });

  it("オペレーターは管理者の範囲を持たない", () => {
    expect(isHqAdmin("hq_operator")).toBe(false);
    expect(isHqAdmin("hq_admin")).toBe(true);
  });

  it("未知のロール文字列は本部として扱わない", () => {
    expect(parseHqRole("superuser")).toBeNull();
    expect(parseHqRole(null)).toBeNull();
    expect(parseHqRole("hq_admin")).toBe("hq_admin");
  });
});

describe("テナントの役割", () => {
  it("担当者は自店舗を操作できる", () => {
    expect(canActAsTenantMember(memberships, "t-staff")).toBe(true);
  });

  it("担当者は精算・事業者情報を扱えない", () => {
    // docs/00 5.4：テナント担当者は精算・事業者情報を閲覧不可
    expect(canActAsTenantOwner(memberships, "t-staff")).toBe(false);
    expect(canActAsTenantOwner(memberships, "t-owner")).toBe(true);
  });

  it("所属していないテナントは操作できない", () => {
    expect(canActAsTenantMember(memberships, "t-other")).toBe(false);
    expect(canActAsTenantOwner(memberships, "t-other")).toBe(false);
    expect(findMembership(memberships, "t-other")).toBeNull();
  });
});

describe("本部管理者の多要素認証", () => {
  it("aal2 のみを満たすとみなす", () => {
    expect(satisfiesHqAdminAssurance("aal2")).toBe(true);
    expect(satisfiesHqAdminAssurance("aal1")).toBe(false);
    expect(satisfiesHqAdminAssurance(null)).toBe(false);
  });
});
