import "server-only";

import Stripe from "stripe";

import { required } from "@/lib/supabase/env";
import { assertStripeSecretKey } from "./secret-key";

/**
 * Stripe SDK の唯一の入口（CLAUDE.md 決済ルール）。
 * 注文ロジックや API ハンドラから Stripe SDK を直接呼ばず、必ず
 * lib/payments/ 配下を経由させる。
 *
 * apiVersion は SDK 同梱の既定値に任せず固定する。SDK 更新で
 * リクエストの形が黙って変わるのを防ぐため。
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;

  // required() が前後の空白・改行を落とし、ヘッダに使えない文字を弾く。
  // 貼り付け時に紛れ込んだ改行で Authorization ヘッダの組み立てが落ち、
  // Stripe の接続エラーに化けて原因が見えなくなったことがある。
  const secretKey = assertStripeSecretKey(
    "STRIPE_SECRET_KEY",
    required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
  );

  cached = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "waiwaimarket" },
  });
  return cached;
}

export function stripeWebhookSecret(): string {
  return required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
}

export type { Stripe };
