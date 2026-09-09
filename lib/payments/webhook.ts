import "server-only";

import type Stripe from "stripe";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { fetchAccountStatus } from "./connect";
import { stripe, stripeWebhookSecret } from "./stripe";

/**
 * Stripe Webhook の署名検証と重複処理の防止（docs/04、CLAUDE.md 決済ルール）。
 *
 * 重複防止は stripe_webhook_events の主キー（event_id）で行う。
 * 同じイベントが再送されたら INSERT が主キー違反になるので、そこで弾く。
 * 判定を件数の SELECT に頼ると同時到着で二重処理になるため、必ず INSERT の
 * 失敗で判定する。
 *
 * フェーズ1 で扱うのは account.* のみ。決済系のイベントはフェーズ3 で追加する。
 */

export const PHASE1_EVENT_TYPES = ["account.updated"] as const;

export type VerifiedEvent = { ok: true; event: Stripe.Event } | { ok: false; message: string };

export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<VerifiedEvent> {
  if (!signature) {
    return { ok: false, message: "stripe-signature ヘッダがありません" };
  }
  try {
    const event = await stripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      stripeWebhookSecret(),
    );
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "署名の検証に失敗しました",
    };
  }
}

export type ClaimResult = "claimed" | "retry" | "already_processed";

/**
 * 受信を記録して処理権を得る。
 *
 *   claimed           初回。処理する
 *   retry             受信済みだが未処理（前回失敗）。Stripe の再送なので処理し直す
 *   already_processed 処理済み。何もしない
 *
 * 「処理済みか」を SELECT で先に確かめると同時到着で二重処理になるため、
 * まず INSERT を試し、主キー違反になったときだけ状態を見る。
 */
export async function claimEvent(event: Stripe.Event): Promise<ClaimResult> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("stripe_webhook_events").insert({
    event_id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, never>,
  });

  if (!error) return "claimed";
  // 23505 = unique_violation。同じイベントが既に届いている。
  if (error.code !== "23505") throw error;

  const { data, error: readError } = await service
    .from("stripe_webhook_events")
    .select("processed_at, attempts")
    .eq("event_id", event.id)
    .single();

  if (readError) throw readError;
  if (data.processed_at !== null) return "already_processed";

  await service
    .from("stripe_webhook_events")
    .update({ attempts: data.attempts + 1 })
    .eq("event_id", event.id);

  return "retry";
}

export async function markProcessed(eventId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
}

export async function markFailed(eventId: string, message: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from("stripe_webhook_events")
    .update({ process_error: message.slice(0, 1000) })
    .eq("event_id", eventId);
}

/**
 * account.updated を受けてテナントの Stripe 状態を同期する。
 *
 * イベントに載っている値ではなく Stripe から取り直す。
 * Webhook は順序が保証されず、古いイベントが後から届くと
 * 有効化済みのフラグを巻き戻してしまうため
 * （docs/05「決済通知の順番が前後しても正しい状態になる」）。
 * 取り直した現在値で上書きするので、再処理しても結果は変わらない。
 */
export async function syncAccountStatus(account: Stripe.Account): Promise<void> {
  const service = createSupabaseServiceClient();
  const status = await fetchAccountStatus(account.id);

  const query = service.from("tenants").update({
    stripe_charges_enabled: status.chargesEnabled,
    stripe_payouts_enabled: status.payoutsEnabled,
  });

  const tenantId = account.metadata?.tenant_id;
  const { error } = tenantId
    ? await query.eq("id", tenantId)
    : await query.eq("stripe_account_id", account.id);

  if (error) throw error;
}
