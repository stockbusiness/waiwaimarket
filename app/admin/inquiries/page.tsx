import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import {
  INQUIRY_SENDER_LABEL,
  INQUIRY_STATUS_LABEL,
  isInquiryStatus,
} from "@/lib/inquiries/status";
import { listInquiries } from "@/lib/inquiries/store";

export const metadata = { title: "問い合わせ（監督）" };

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
 * 本部の問い合わせ一覧（0014、docs/06 フェーズ5-4「問い合わせ運用の整備」）。
 *
 * **読むだけ。** 0014 に本部の書き込みポリシーを置いていない。宛先を
 * テナントにしたため、本部も返信できると、どちらが答えるか決まっていない
 * 状態で二重返信が起きる。放置されているスレッドを見つけたら、本部は
 * テナントへ別途連絡する（一次受付の担当は未確定。CLAUDE.md 参照）。
 */
export default async function AdminInquiriesPage({
  searchParams,
}: PageProps<"/admin/inquiries">) {
  const context = await withPageGuard("hq", requireHqOperator);

  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : undefined;
  const filter = raw && isInquiryStatus(raw) ? raw : undefined;

  const inquiries = await listInquiries(context.client, { by: "hq" }, filter);

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/inquiries", label: "問い合わせ" },
        ]}
      />

      <PageHeader
        title="問い合わせ"
        description="全テナント分を閲覧できます。本部からの返信は行えません（回答はテナントが行います）。"
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
                  href={current ? `/admin/inquiries?status=${current}` : "/admin/inquiries"}
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
                    <TextLink href={`/admin/inquiries/${inquiry.id}`}>
                      <span className="font-medium">{inquiry.productTitle}</span>
                    </TextLink>
                    <Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
                  </div>
                  <p className="text-muted">{inquiry.tenantName ?? "（店舗名なし）"}</p>
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
