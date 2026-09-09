/**
 * 購入者・テナント・本部は別ログイン画面・別セッションとする（docs/00 5.4）。
 *
 * 実現方法：Supabase の認証 cookie を面ごとに別名にし、さらに cookie の path を
 * 分ける。path を分けることでブラウザが自動的に送り分けるため、同一ブラウザで
 * 3 者が同時にログインしてもセッションが混ざらない。
 *
 * 認証コールバックとログアウトの経路を各面の path 配下に置いているのは、
 * PKCE の code verifier cookie も同じ scope に入るためである。
 * /api/... のような共通経路に置くと、path で絞った cookie が送られず失敗する。
 */
export const AUDIENCES = ["buyer", "tenant", "hq"] as const;

export type Audience = (typeof AUDIENCES)[number];

export type AudienceConfig = {
  /** 認証 cookie の名前。面ごとに変える */
  cookieName: string;
  /** cookie の path。ブラウザの送り分けはこれで決まる */
  cookiePath: string;
  /** ログイン画面 */
  loginPath: string;
  /** ログイン後の既定の遷移先 */
  homePath: string;
  /** メール認証のリダイレクト先 */
  callbackPath: string;
};

export const AUDIENCE_CONFIG: Record<Audience, AudienceConfig> = {
  buyer: {
    cookieName: "wm-buyer-auth",
    cookiePath: "/",
    loginPath: "/login",
    homePath: "/",
    callbackPath: "/auth/callback",
  },
  tenant: {
    cookieName: "wm-tenant-auth",
    cookiePath: "/tenant",
    loginPath: "/tenant/login",
    homePath: "/tenant",
    callbackPath: "/tenant/auth/callback",
  },
  hq: {
    cookieName: "wm-hq-auth",
    cookiePath: "/admin",
    loginPath: "/admin/login",
    homePath: "/admin",
    callbackPath: "/admin/auth/callback",
  },
};

export function isAudience(value: string): value is Audience {
  return (AUDIENCES as readonly string[]).includes(value);
}

/** URL のパスからどの面かを決める。判定できないものは購入者として扱う */
export function audienceForPath(pathname: string): Audience {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "hq";
  if (pathname === "/tenant" || pathname.startsWith("/tenant/")) return "tenant";
  return "buyer";
}

/** ログイン不要で通す経路。ログイン画面と認証コールバックを閉め出さないため */
export function isPublicAuthPath(pathname: string): boolean {
  for (const audience of AUDIENCES) {
    const config = AUDIENCE_CONFIG[audience];
    if (pathname === config.loginPath) return true;
    if (pathname.startsWith(`${config.homePath === "/" ? "" : config.homePath}/auth/`)) {
      return true;
    }
  }
  return pathname.startsWith("/auth/");
}
