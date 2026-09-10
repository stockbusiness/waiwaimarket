import { ConfigurationError } from "@/lib/supabase/env";

/**
 * Stripe シークレットキーの形式検証。
 *
 * 公開可能キー（`pk_`）を取り違えて設定しても Stripe への接続自体は成立し、
 * 失敗するのは書き込み系の API だけになる。lib/supabase/service-key.ts と
 * 同じ種類の取り違えなので、同じように入口で弾く。
 *
 * このファイルは環境変数を読まない純粋な関数だけを置く
 * （server-only を付けず単体テストする）。
 * キーの値をメッセージやログに含めてはならない。
 */

const PUBLISHABLE_PREFIX = "pk_";

/**
 * シークレットキーとして使える形式かを検証し、そのまま返す。
 *
 * 通すのは `sk_`（通常のシークレットキー）と `rk_`（制限付きキー）。
 * 判別できない形式は通す。キーの有効性を決めるのは Stripe 側であり、
 * こちらが新しいキー形式を知らないせいで正しい設定を拒否してはいけない。
 */
export function assertStripeSecretKey(variableName: string, key: string): string {
  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    throw new ConfigurationError(
      variableName,
      `環境変数 ${variableName} に公開可能キー（${PUBLISHABLE_PREFIX}…）が設定されています。` +
        `Stripe のシークレットキー（sk_…）を設定してください。`,
    );
  }

  return key;
}
