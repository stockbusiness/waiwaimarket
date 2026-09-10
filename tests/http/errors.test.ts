import { describe, expect, it } from "vitest";

import { forbidden, unauthenticated } from "@/lib/auth/errors";
import { apiErrorResponse } from "@/lib/http/errors";
import { ConfigurationError } from "@/lib/supabase/env";

describe("apiErrorResponse", () => {
  it("設定エラーは 503 と変数名を返す", async () => {
    const response = apiErrorResponse(
      new ConfigurationError("SUPABASE_SERVICE_ROLE_KEY"),
      "出店申請に失敗しました",
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { reason: "configuration", variable: "SUPABASE_SERVICE_ROLE_KEY" },
    });
  });

  it("設定エラーの応答に値は含めない", async () => {
    const response = apiErrorResponse(new ConfigurationError("STRIPE_SECRET_KEY"), "x");
    const text = JSON.stringify(await response.json());
    expect(text).toContain("STRIPE_SECRET_KEY");
    expect(text).not.toContain("sk_");
  });

  it("認可の失敗はこれまでどおり 401 / 403", async () => {
    expect(apiErrorResponse(unauthenticated(), "x").status).toBe(401);
    expect(apiErrorResponse(forbidden(), "x").status).toBe(403);
  });

  it("それ以外は 500", async () => {
    const response = apiErrorResponse(new Error("boom"), "x");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: { reason: "internal" } });
  });

  it("500 の応答に例外の詳細を含めない", async () => {
    const response = apiErrorResponse(new Error("接続文字列 postgres://secret@host"), "x");
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
