import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  authErrorResponse,
  forbidden,
  mfaRequired,
  statusForReason,
  unauthenticated,
} from "@/lib/auth/errors";

describe("認可エラーの HTTP 変換", () => {
  it("未ログインは 401、権限不足と MFA 未了は 403", () => {
    expect(statusForReason("unauthenticated")).toBe(401);
    expect(statusForReason("forbidden")).toBe(403);
    expect(statusForReason("mfa_required")).toBe(403);
  });

  it("AuthorizationError を JSON へ変換する", async () => {
    const response = authErrorResponse(forbidden("だめ"));
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: { reason: "forbidden", message: "だめ" },
    });
  });

  it("関係のない例外は変換しない", () => {
    expect(authErrorResponse(new Error("boom"))).toBeNull();
  });

  it("生成関数が正しい理由を持つ", () => {
    expect(unauthenticated()).toBeInstanceOf(AuthorizationError);
    expect(unauthenticated().reason).toBe("unauthenticated");
    expect(mfaRequired().reason).toBe("mfa_required");
  });
});
