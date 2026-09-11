import { describe, expect, it } from "vitest";

import { readApiError } from "@/lib/http/error-message";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readApiError", () => {
  it("設定エラーは足りない変数名を出す", async () => {
    const message = await readApiError(
      json(503, { error: { reason: "configuration", variable: "SUPABASE_SERVICE_ROLE_KEY" } }),
      "失敗しました",
    );
    expect(message).toContain("サーバーの設定が未完了です");
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("入力エラーと設定エラーを別の文言にする", async () => {
    // 以前はどちらも「入力内容をご確認ください」で、原因を切り分けられなかった
    const invalid = await readApiError(json(422, { error: { reason: "invalid_input" } }), "失敗");
    const config = await readApiError(
      json(503, { error: { reason: "configuration", variable: "X" } }),
      "失敗",
    );
    expect(invalid).not.toBe(config);
    expect(invalid).toContain("入力内容");
    expect(config).not.toContain("入力内容");
  });

  it("判別できない場合は HTTP ステータスを添える", async () => {
    expect(await readApiError(json(500, { error: { reason: "internal" } }), "登録できませんでした"))
      .toBe("登録できませんでした（HTTP 500）");
  });

  it("DB のエラーコードがあれば添える", async () => {
    expect(
      await readApiError(json(500, { error: { reason: "failed", code: "42501" } }), "登録できませんでした"),
    ).toBe("登録できませんでした（HTTP 500 / コード 42501）");
  });

  it("本文が JSON でなくても落ちない", async () => {
    const response = new Response("<html>oops</html>", { status: 502 });
    expect(await readApiError(response, "失敗しました")).toBe("失敗しました（HTTP 502）");
  });

  it("既知の理由をそれぞれの文言にする", async () => {
    const cases: [string, string][] = [
      ["already_belongs_to_tenant", "すでに別のテナント"],
      ["slug_taken", "すでに使われています"],
      ["conflict", "先に保存しました"],
      ["not_found", "見つかりません"],
      ["invalid_transition", "実行できない操作"],
      ["unauthenticated", "ログイン"],
      ["mfa_required", "多要素認証"],
      ["forbidden", "権限"],
    ];
    for (const [reason, expected] of cases) {
      expect(await readApiError(json(400, { error: { reason } }), "失敗")).toContain(expected);
    }
  });
});
