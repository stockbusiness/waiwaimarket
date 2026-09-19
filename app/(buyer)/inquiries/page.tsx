import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { INQUIRY_SENDER_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/inquiries/status";
import { listInquiries } from "@/lib/inquiries/store";

export const metadata = { title: "お問い合わせ" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/** 一覧に 1 行だけ添える抜粋。長いものは途中で切る */
function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

/**
 * 購入者のお問い合わせ一覧（0014）。
 *
 * 0014 の `inquiries_buyer_read` が自分のスレッドだけに絞る。
 * メール通知はまだ無いので、ここが返事を受け取る唯一の場所になる。
 */
export default async function BuyerInquiriesPage() {
  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login?next=%2Finquiries");
    }
    throw error;
  }

  const inquiries = await listInquiries(context.client, {
    by: "buyer",
    buyerId: context.user.id,
  });

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/inquiries", label: "お問い合わせ" },
        ]}
      />
      <PageHeader
        title="お問い合わせ"
        description="価格をお問い合わせいただいた商品のやり取りです。お返事はこの画面に届きます。"
      />

      {inquiries.length === 0 ? (
        <p className="text-sm text-muted">
          お問い合わせはまだありません。
          <span className="ml-1">
            <TextLink href="/products">商品を探す</TextLink>
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id}>
              <Card>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextLink href={`/inquiries/${inquiry.id}`}>
                      <span className="font-medium">{inquiry.productTitle}</span>
                    </TextLink>
                    <Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
                  </div>
                  {inquiry.tenantName ? (
                    <p className="text-muted">{inquiry.tenantName}</p>
                  ) : null}
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
