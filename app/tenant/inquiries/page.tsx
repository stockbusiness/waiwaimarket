import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import {
  INQUIRY_SENDER_LABEL,
  INQUIRY_STATUS_LABEL,
  isInquiryStatus,
} from "@/lib/inquiries/status";
import { listInquiries } from "@/lib/inquiries/store";

export const metadata = { title: "問い合わせ" };

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "open", label: "未回答" },
  { value: "answered", label: "回答済み" },
  { value: "closed", label: "完了" },
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

/**
 * テナントの問い合わせ一覧（0014、docs/06 フェーズ5-4）。
 *
 * 既定は「すべて」だが、並びは未回答が先。0014 の `inquiry_status` は
 * open → answered → closed の順で宣言してあるので、状態の昇順で並べると
 * 手を付けるべきものが上に来る。
 *
 * メール通知はまだ入れていない（ドメイン未取得で送信ドメインを設定
 * できないため）。この一覧が気づく唯一の場所なので、テナント管理の
 * 先頭にも未回答の件数を出している。
 */
export default async function TenantInquiriesPage({
  searchParams,
}: PageProps<"/tenant/inquiries">) {
  const context = await withPageGuard("tenant", requireTenantUser);

  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : undefined;
  const filter = raw && isInquiryStatus(raw) ? raw : undefined;

  const inquiries = await listInquiries(
    context.client,
    { by: "tenant", tenantIds: context.memberships.map((m) => m.tenantId) },
    filter,
  );

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/inquiries", label: "問い合わせ" },
        ]}
      />

      <PageHeader
        title="問い合わせ"
        description="価格を掲載していない商品への問い合わせです。未回答のものが上に並びます。"
      />

      <nav aria-label="状態で絞り込む" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {FILTERS.map((option) => {
          const current = option.value === "all" ? undefined : option.value;
          return (
            <span key={option.value}>
              {current === filter ? (
                <span aria-current="page" className="font-bold">
                  {option.label}
                </span>
              ) : (
                <TextLink
                  href={
                    current
                      ? `/tenant/inquiries?status=${current}`
                      : "/tenant/inquiries"
                  }
                >
                  {option.label}
                </TextLink>
              )}
            </span>
          );
        })}
      </nav>

      {inquiries.length === 0 ? (
        <p className="text-sm text-muted">該当する問い合わせはありません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/tenant/inquiries/${inquiry.id}`}>
                      <span className="font-medium">{inquiry.productTitle}</span>
                    </TextLink>
                    <Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
                  </div>
                  {inquiry.lastMessage ? (
                    <p className="break-words text-muted">
                      {INQUIRY_SENDER_LABEL[inquiry.lastMessage.senderRole]}：
                      {excerpt(inquiry.lastMessage.body)}
                    </p>
                  ) : null}
                  <p className="text-xs text-subtle">
                    {DATE_FORMAT.format(new Date(inquiry.updatedAt))}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
