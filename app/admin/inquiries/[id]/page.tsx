import { notFound } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { InquiryThread } from "@/components/ui/inquiry-thread";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { INQUIRY_STATUS_LABEL } from "@/lib/inquiries/status";
import { getInquiry } from "@/lib/inquiries/store";

export const metadata = { title: "問い合わせ（監督）" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 本部から見た 1 件（0014）。**閲覧のみ。**
 *
 * 0014 に本部の insert ポリシーを置いていないので、入力欄も出さない。
 * 画面だけ出して API が拒否する形にすると、担当者は何度も押すことになる。
 */
export default async function AdminInquiryPage({
  params,
}: PageProps<"/admin/inquiries/[id]">) {
  const context = await withPageGuard("hq", requireHqOperator);
  const { id } = await params;

  const inquiry = await getInquiry(context.client, id);
  if (!inquiry) notFound();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/inquiries", label: "問い合わせ" },
          { href: `/admin/inquiries/${inquiry.id}`, label: inquiry.productTitle },
        ]}
      />

      <PageHeader
        title={inquiry.productTitle}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
            <span>{inquiry.tenantName ?? "（店舗名なし）"}</span>
          </span>
        }
      />

      <dl className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
        <div className="flex gap-2">
          <dt className="text-muted">受付</dt>
          <dd>{DATE_FORMAT.format(new Date(inquiry.createdAt))}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">最終更新</dt>
          <dd>{DATE_FORMAT.format(new Date(inquiry.updatedAt))}</dd>
        </div>
      </dl>

      <p className="text-sm">
        <TextLink href={`/admin/products/${inquiry.productId}`}>商品の審査画面へ</TextLink>
      </p>

      <section className="flex flex-col gap-3">
        <SectionHeader title="やり取り" />
        <InquiryThread messages={inquiry.messages} viewer="hq" />
      </section>

      <Alert tone="warning">
        本部からは返信できません。回答はテナントが行います。対応が滞っている場合は、
        テナントへ別途ご連絡ください。
      </Alert>
    </PageShell>
  );
}
