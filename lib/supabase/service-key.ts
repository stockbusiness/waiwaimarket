import { ConfigurationError } from "./env";

/**
 * サービスロールキーの形式検証。
 *
 * Supabase の API Keys 画面は Publishable キーと Secret キーが隣り合っており、
 * 取り違えても Supabase 側では認証が通ってしまう。通るのは anon 相当の権限なので、
 * 実際に壊れるのは RLS を迂回したい書き込みだけで、症状は
 * 「INSERT だけが 42501 で落ちる」という原因の分かりにくいものになる。実際に詰まった。
 *
 * ここで弾いて ConfigurationError にしておけば、変数名を名指しした 503 で返る。
 *
 * このファイルは環境変数を読まない純粋な関数だけを置く（server-only を付けず単体テストする）。
 * キーの値をメッセージやログに含めてはならない。
 */

/** 新形式のキー。JWT ではなくゲートウェイ側でロールへ解決される */
const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

/**
 * Legacy の JWT キーからロールクレームを取り出す。
 *
 * 署名は検証しない。ここでの目的は正当性の確認ではなく取り違えの検出なので、
 * 読めなければ判定を諦めて呼び出し元へ通す（正否を決めるのはサーバー側）。
 */
function readJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload !== "object" || payload === null) return null;
    const role = (payload as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * サービスロールキーとして使える形式かを検証し、そのまま返す。
 *
 * 判定できない形式は通す。SDK と同じ方針で、キーの有効性を決めるのはサーバー側であり、
 * ここが新しいキー形式を知らないせいで正しい設定を拒否してはいけない。
 */
export function assertServiceRoleKey(variableName: string, key: string): string {
  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    throw new ConfigurationError(
      variableName,
      `環境変数 ${variableName} に Publishable キー（${PUBLISHABLE_PREFIX}…）が設定されています。` +
        `Supabase の Settings → API Keys → Secret keys にある ${SECRET_PREFIX}… の値を設定してください。`,
    );
  }

  const role = readJwtRole(key);
  if (role !== null && role !== "service_role") {
    throw new ConfigurationError(
      variableName,
      `環境変数 ${variableName} に role が "${role}" のキーが設定されています。` +
        `service_role のキーを設定してください。`,
    );
  }

  return key;
}
