import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

import { resolveNextPath } from "./redirect";
import { getHqRole } from "./session";

/**
 * メール認証のコールバックとログアウト。
 *
 * 面ごとに path を分けた経路へ置く必要がある（PKCE の code verifier cookie が
 * その面の scope にしか無いため）。処理は共通なのでここで組み立てて、
 * 各 route.ts からは生成した関数を re-export するだけにしている。
 */

function loginRedirect(
  request: NextRequest,
  audience: Audience,
  message: string,
): NextResponse {
  const url = new URL(AUDIENCE_CONFIG[audience].loginPath, request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export function createCallbackHandler(audience: Audience) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = request.nextUrl;

    const authError = searchParams.get("error_description") ?? searchParams.get("error");
    if (authError) {
      return loginRedirect(request, audience, authError);
    }

    const code = searchParams.get("code");
    if (!code) {
      return loginRedirect(request, audience, "認証コードがありません");
    }

    const client = await createSupabaseServerClient(audience);
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      return loginRedirect(request, audience, "ログインに失敗しました");
    }

    // 本部の画面は hq_members に登録された利用者だけに開く。
    // 登録がなければセッションを破棄して閉め出す。
    if (audience === "hq") {
      const role = await getHqRole(client);
      if (role === null) {
        await client.auth.signOut();
        await recordAudit({
          actorId: data.user.id,
          actorRole: null,
          action: "hq.login.rejected",
          detail: { reason: "not_an_hq_member" },
          ip: request.headers.get("x-forwarded-for"),
        });
        return loginRedirect(request, audience, "本部の権限がありません");
      }

      await recordAudit({
        actorId: data.user.id,
        actorRole: role,
        action: "hq.login",
        ip: request.headers.get("x-forwarded-for"),
      });
    }

    const next = resolveNextPath(audience, searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  };
}

export function createSignOutHandler(audience: Audience) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    const client = await createSupabaseServerClient(audience);
    const {
      data: { user },
    } = await client.auth.getUser();

    await client.auth.signOut();

    if (audience === "hq" && user) {
      await recordAudit({
        actorId: user.id,
        actorRole: null,
        action: "hq.logout",
        ip: request.headers.get("x-forwarded-for"),
      });
    }

    return NextResponse.redirect(
      new URL(AUDIENCE_CONFIG[audience].loginPath, request.url),
    );
  };
}
