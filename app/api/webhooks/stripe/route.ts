import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import {
  claimEvent,
  markFailed,
  markProcessed,
  syncAccountStatus,
  verifyWebhook,
} from "@/lib/payments/webhook";

/**
 * Stripe Webhook（docs/04）。
 * 署名を検証し、イベントIDで重複処理を防ぐ。
 * フェーズ1 で処理するのは account.updated のみ。ほかは受信記録だけ残して
 * 200 を返す（Stripe に再送させない）。決済系はフェーズ3 で追加する。
 *
 * 署名検証は生のリクエストボディに対して行う必要があるため、
 * JSON へパースする前に text() で受ける。
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verified = await verifyWebhook(rawBody, request.headers.get("stripe-signature"));

  if (!verified.ok) {
    // 署名が検証できないものは記録もしない
    return Response.json({ error: verified.message }, { status: 400 });
  }

  const { event } = verified;

  const claim = await claimEvent(event);
  if (claim === "already_processed") {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "account.updated") {
      await syncAccountStatus(event.data.object as Stripe.Account);
    }
    await markProcessed(event.id);
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(event.id, message);
    console.error("Stripe Webhook の処理に失敗しました", { id: event.id, error });
    // 500 を返して Stripe に再送させる。processed_at は空のままなので、
    // 再送時に claimEvent が retry を返して処理し直す。
    return Response.json({ error: { reason: "processing_failed" } }, { status: 500 });
  }
}
