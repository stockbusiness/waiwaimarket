import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  AUDIENCE_CONFIG,
  audienceForPath,
  isPublicAuthPath,
} from "@/lib/supabase/audience";
import { isProduction, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Next.js 16 では middleware.ts は proxy.ts へ名称変更された（機能は同じ）。
 *
 * ここでの責務は 2 つだけ。
 *   1. セッション cookie の更新をレスポンスへ書き戻す
 *      （Server Component からは cookie を書けないため、ここが唯一の機会）
 *   2. 未ログインで /tenant, /admin に入ろうとした場合のリダイレクト
 *
 * 認可の本体はここに置かない。Next.js の公式ドキュメントが Proxy を
 * 認可の完全な解決策にするなと明示しており、実際の判定は
 * lib/auth/guard.ts（API 側）と RLS（DB 側）の二重で行う。
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const audience = audienceForPath(pathname);
  const config = AUDIENCE_CONFIG[audience];

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: {
      name: config.cookieName,
      path: config.cookiePath,
      sameSite: "lax",
      secure: isProduction(),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 認証 cookie を載せたレスポンスは CDN にキャッシュさせない
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // getUser() は Auth サーバーで JWT を検証する。同時にトークンの更新も走る。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsLogin = audience !== "buyer" && !isPublicAuthPath(pathname);

  if (needsLogin && !user) {
    const loginUrl = new URL(config.loginPath, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと画像最適化を除いた全経路。
    // これらを通すと CSS や画像がリダイレクトに巻き込まれる。
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
