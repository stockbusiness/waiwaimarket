import "server-only";

import type Stripe from "stripe";

import { stripe } from "./stripe";

/**
 * Stripe Connect のオンボーディング（docs/01 4.3、docs/06 フェーズ1-4）。
 *
 * 【重要】現行の Accounts API では `type: 'express'` は非推奨で、
 * controller ハッシュで表現する。SDK 22.6.1（OpenAPI spec v2442）の型定義に
 *   「The `type` parameter is deprecated. Use `controller` instead to configure
 *    dashboard access, fee payer, loss liability, and requirement collection.」
 * と明記されている。docs/01 の方針は controller では次の組み合わせになる。
 *
 *   stripe_dashboard.type = 'express'      → Express ダッシュボード
 *   requirement_collection = 'stripe'      → 本人確認要件の収集は Stripe が行う
 *   fees.payer             = 'application' → Stripe 手数料は本部が負担
 *   losses.payments        = 'application' → 返金・チャージバックの負債は本部が負う
 *
 * 最後の 2 つは docs/01 の
 *   「返金額、チャージバック額、紛争手数料は本部の Stripe 残高から引かれ、
 *     Stripe に対する責任主体は本部のままである」
 * に対応する。
 *
 * 出金は本部が制御するため manual、テナント残高がマイナスになった場合の
 * 回収手段として debit_negative_balances を有効にする（docs/01 15.1）。
 */
export type CreateConnectedAccountInput = {
  tenantId: string;
  email: string;
  /** 事業者名。Stripe の明細表示に使われる */
  businessName: string;
};

export async function createConnectedAccount(
  input: CreateConnectedAccountInput,
): Promise<Stripe.Account> {
  return stripe().accounts.create({
    country: "JP",
    email: input.email,
    controller: {
      stripe_dashboard: { type: "express" },
      requirement_collection: "stripe",
      fees: { payer: "application" },
      losses: { payments: "application" },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: input.businessName },
    settings: {
      payouts: {
        schedule: { interval: "manual" },
        debit_negative_balances: true,
      },
    },
    metadata: { tenant_id: input.tenantId },
  });
}

export type OnboardingLinkInput = {
  stripeAccountId: string;
  /** 中断・期限切れ時に戻す先 */
  refreshUrl: string;
  /** 完了後に戻す先 */
  returnUrl: string;
};

export async function createOnboardingLink(
  input: OnboardingLinkInput,
): Promise<Stripe.AccountLink> {
  return stripe().accountLinks.create({
    account: input.stripeAccountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });
}

export type ConnectedAccountStatus = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** まだ提出されていない要件。画面にそのまま出さず件数だけ使う */
  currentlyDue: string[];
};

export function readAccountStatus(account: Stripe.Account): ConnectedAccountStatus {
  return {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    currentlyDue: account.requirements?.currently_due ?? [],
  };
}

export async function fetchAccountStatus(
  stripeAccountId: string,
): Promise<ConnectedAccountStatus> {
  return readAccountStatus(await stripe().accounts.retrieve(stripeAccountId));
}
