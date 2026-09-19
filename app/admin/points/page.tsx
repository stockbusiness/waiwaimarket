import { Alert } from "@/components/ui/alert";
import { PointRuleForm } from "@/components/admin/point-rule-form";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { formatBasisPoints, formatPoints } from "@/lib/points/labels";
import { getOutstanding, listMonthlyMovements } from "@/lib/points/liability";
import { getCurrentBaseRule, listBaseRuleHistory } from "@/lib/points/settings";

export const metadata = { title: "オーリーポイント" };

const DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

const MONTH = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * 本部のポイント設定と発行状況（docs/02 6.1・4.4、docs/06 フェーズ4-7）。
 *
 * 閲覧は本部オペレーターまで、変更は本部管理者のみ（docs/00 5.4）。
 * 0004 の `point_rules_hq_read` / `point_rules_hq_write` が同じ線を引く。
 *
 * **付与はまだ走らない。** 起点が決済成功（docs/02 6.3）で、Stripe が
 * 未接続のため数字はすべて 0 になる。設定の変更はいま行えるので、
 * 決済を繋いだ時点から正しい率で付与される。
 */
export default async function AdminPointsPage() {
  const context = await withPageGuard("hq", requireHqOperator);
  const canEdit = context.role === "hq_admin";
  const needsMfa = canEdit && context.assuranceLevel !== "aal2";

  const [rule, history, outstanding, monthly] = await Promise.all([
    getCurrentBaseRule(context.client),
    listBaseRuleHistory(context.client),
    getOutstanding(context.client),
    listMonthlyMovements(context.client),
  ]);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/points", label: "オーリーポイント" },
        ]}
      />

      <PageHeader
        title="オーリーポイント"
        description="基本還元のルールと、発行しているポイントの状況です。ルールの変更は新しい版として積まれ、すでにあるご注文には適用されません。"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="基本還元のルール" />

        {rule === null ? (
          <Alert tone="error">
            基本還元のルールが設定されていません。この状態ではポイントは付与されません。
            マイグレーション 0016 が適用されているかご確認ください。
          </Alert>
        ) : (
          <>
            <Card>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">還元率</dt>
                  <dd className="font-bold">{formatBasisPoints(rule.rateBasisPoints)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">1 回の利用上限</dt>
                  <dd>{formatBasisPoints(rule.usageCapBasisPoints)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">確定までの日数</dt>
                  <dd>発送登録から {rule.confirmAfterDays} 日</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">有効期限</dt>
                  <dd>付与から {rule.expireAfterMonths} か月</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">この版の適用開始</dt>
                  <dd>{DATE_TIME.format(new Date(rule.effectiveFrom))}</dd>
                </div>
              </dl>
            </Card>

            {needsMfa ? (
              <Alert tone="warning">
                ルールの変更には多要素認証が必要です。
                <span className="ml-1">
                  <TextLink href="/admin/mfa">設定する</TextLink>
                </span>
              </Alert>
            ) : null}

            {canEdit && !needsMfa ? (
              <Card>
                <PointRuleForm
                  currentId={rule.id}
                  initial={{
                    rateBasisPoints: rule.rateBasisPoints,
                    usageCapBasisPoints: rule.usageCapBasisPoints,
                    confirmAfterDays: rule.confirmAfterDays,
                    expireAfterMonths: rule.expireAfterMonths,
                  }}
                />
              </Card>
            ) : null}

            {canEdit ? null : (
              <p className="text-sm text-muted">
                変更できるのは本部管理者のみです。内容の確認のみ行えます。
              </p>
            )}
          </>
        )}
      </section>

      {history.length > 1 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="変更の履歴" />
          <p className="text-sm text-muted">
            過去の注文は、そのときの版で計算されています。
          </p>
          <ul className="flex flex-col gap-2">
            {history.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
              >
                <span className="text-muted">
                  {DATE_TIME.format(new Date(version.effectiveFrom))} 〜{" "}
                  {version.effectiveTo
                    ? DATE_TIME.format(new Date(version.effectiveTo))
                    : "現在"}
                </span>
                <span>
                  還元 {formatBasisPoints(version.rateBasisPoints)} ／ 上限{" "}
                  {formatBasisPoints(version.usageCapBasisPoints)} ／ 確定{" "}
                  {version.confirmAfterDays} 日 ／ 期限 {version.expireAfterMonths} か月
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="未使用のポイント" />
        <Card>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-bold">本部負担分</dt>
              <dd className="font-bold">
                {formatPoints(outstanding.headquartersReserve)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">全体</dt>
              <dd>{formatPoints(outstanding.totalReserve)}</dd>
            </div>
          </dl>
        </Card>
        <p className="text-xs leading-5 text-subtle">
          確定待ちの分も含みます。1 ポイント＝1 円として、全額が使われた場合の最大額です。
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="月次の発行と利用" />
        {monthly.length === 0 ? (
          <p className="text-sm text-muted">
            まだ発行がありません。ポイントの付与は決済の成功が起点です。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {monthly.map((month) => (
              <li key={month.yearMonth}>
                <Card>
                  <div className="flex flex-col gap-2 text-sm">
                    <span className="font-bold">
                      {MONTH.format(new Date(`${month.yearMonth}T00:00:00Z`))}
                    </span>
                    <dl className="flex flex-wrap gap-x-6 gap-y-1">
                      <div className="flex gap-2">
                        <dt className="text-muted">発行</dt>
                        <dd>{formatPoints(month.issuedPoints)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">確定</dt>
                        <dd>{formatPoints(month.confirmedPoints)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">利用</dt>
                        <dd>{formatPoints(month.usedPoints)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">失効</dt>
                        <dd>{formatPoints(month.expiredPoints)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">取り消し</dt>
                        <dd>{formatPoints(month.reversedPoints)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">調整</dt>
                        <dd>{formatPoints(month.adjustedPoints)}</dd>
                      </div>
                    </dl>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-5 text-subtle">
          月次の警告基準額は未確定のため、まだ警告は出していません。
        </p>
      </section>
    </PageShell>
  );
}
