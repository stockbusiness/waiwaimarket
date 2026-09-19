import { redirect } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { getBalance, listExpiringLots, listHistory } from "@/lib/points/account";
import {
  ENTRY_TYPE_LABEL,
  LOT_STATUS_LABEL,
  formatDelta,
  formatPoints,
} from "@/lib/points/labels";

export const metadata = { title: "オーリーポイント" };

const DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

const DATE = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

/**
 * 購入者のポイント画面（docs/02 6.2、docs/06 フェーズ4-6）。
 *
 * 0002 の `point_account_self` などが自分の行だけに絞る。
 * 残高は口座に持たず、台帳とロットの集計（`point_balances` ビュー）から出す。
 *
 * **付与はまだ走らない。** 起点が決済成功（docs/02 6.3）で、Stripe が
 * 未接続のため注文は決済待ちから動かない。画面は 0 件で正しい。
 */
export default async function BuyerPointsPage() {
  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login?next=%2Fpoints");
    }
    throw error;
  }

  const [balance, history, lots] = await Promise.all([
    getBalance(context.client, context.user.id),
    listHistory(context.client, context.user.id),
    listExpiringLots(context.client, context.user.id),
  ]);

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/points", label: "オーリーポイント" },
        ]}
      />
      <PageHeader
        title="オーリーポイント"
        description="1 ポイント＝1 円として、お買い物の際にご利用いただけます。"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="残高" />
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-bold">ご利用いただける分</span>
            <span className="text-lg font-bold">{formatPoints(balance.usablePoints)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">獲得予定（確定待ち）</span>
            <span>{formatPoints(balance.pendingPoints)}</span>
          </div>
          {balance.reservedPoints > 0 ? (
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted">購入手続き中に確保</span>
              <span>{formatPoints(balance.reservedPoints)}</span>
            </div>
          ) : null}
        </div>

        {/* docs/02 6.4「残高が 0 未満の間はポイント利用を停止する」 */}
        {balance.usablePoints < 0 ? (
          <Alert tone="warning">
            返品などにより残高がマイナスになっています。次回の獲得分で相殺されるまで、
            ポイントのご利用を停止しています。お客様への追加のご請求はありません。
          </Alert>
        ) : null}

        <p className="text-xs leading-5 text-subtle">
          獲得したポイントは、発送のご連絡から 14 日後に確定し、ご利用いただけるようになります。
        </p>
      </section>

      {lots.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="有効期限" />
          <ul className="flex flex-col gap-2">
            {lots.map((lot) => (
              <li
                key={lot.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span>{DATE.format(new Date(lot.expiresAt))} まで</span>
                  <Badge>{LOT_STATUS_LABEL[lot.status]}</Badge>
                </span>
                <span className="font-bold">{formatPoints(lot.remainingPoints)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-subtle">
            期限の近いものから順に使われます。
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="履歴" />
        {history.length === 0 ? (
          <p className="text-sm text-muted">
            まだ履歴がありません。
            <span className="ml-1">
              <TextLink href="/products">商品を探す</TextLink>
            </span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        {ENTRY_TYPE_LABEL[entry.entryType]}
                      </span>
                      <span className="break-words text-xs text-muted">{entry.reason}</span>
                      <span className="text-xs text-subtle">
                        {DATE_TIME.format(new Date(entry.occurredAt))}
                      </span>
                    </span>
                    <span
                      className={`font-bold ${entry.delta < 0 ? "text-muted" : ""}`}
                    >
                      {formatDelta(entry.delta)}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted">
        ポイントの詳しい取り扱いは
        <TextLink href="/legal/terms">利用規約</TextLink>
        をご確認ください。現金への交換・他の方への譲渡はできません。
      </p>
    </PageShell>
  );
}
