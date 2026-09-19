import { notFound } from "next/navigation";

import { InquiryActions } from "@/components/tenant/inquiry-actions";
import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { InquiryReply } from "@/components/ui/inquiry-reply";
import { InquiryThread } from "@/components/ui/inquiry-thread";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { canActAsTenantMember } from "@/lib/auth/roles";
import { canPostMessage, INQUIRY_STATUS_LABEL } from "@/lib/inquiries/status";
import { getInquiry } from "@/lib/inquiries/store";

export const metadata = { title: "問い合わせ" };

/**
 * 1 件のやり取り（0014）。
 *
 * RLS（`inquiries_tenant_read`）で他店宛ては読めないが、画面側でも
 * 所属を確かめる（docs/00 8.2「RLS だけに依存しない」）。
 */
export default async function TenantInquiryPage({
  params,
}: PageProps<"/tenant/inquiries/[id]">) {
  const context = await withPageGuard("tenant", requireTenantUser);
  const { id } = await params;

  const inquiry = await getInquiry(context.client, id);
  if (!inquiry || !canActAsTenantMember(context.memberships, inquiry.tenantId)) {
    notFound();
  }

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/tenant", label: "テナント管理" },
          { href: "/tenant/inquiries", label: "問い合わせ" },
          { href: `/tenant/inquiries/${inquiry.id}`, label: inquiry.productTitle },
        ]}
      />

      <PageHeader
        title={inquiry.productTitle}
        description={<Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>}
      />

      <p className="text-sm">
        <TextLink href={`/tenant/products/${inquiry.productId}`}>
          商品の編集画面へ
        </TextLink>
      </p>

      <section className="flex flex-col gap-3">
        <SectionHeader title="やり取り" />
        <InquiryThread messages={inquiry.messages} viewer="tenant" />
      </section>

      <section className="flex flex-col gap-3">
        {canPostMessage(inquiry.status) ? (
          <InquiryReply
            endpoint={`/tenant/api/inquiries/${inquiry.id}/messages`}
            label="お客様への返信"
          />
        ) : (
          <Alert tone="success">
            この問い合わせは完了にしています。書き込むには再開してください。
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="状態" />
        <InquiryActions inquiryId={inquiry.id} status={inquiry.status} />
      </section>

      <p className="text-xs leading-5 text-subtle">
        価格や在庫の条件は、この画面でのやり取りでお伝えします。注文そのものは
        この画面からは作成できません（価格を掲載する設定に切り替えると、
        購入者はカートから購入できるようになります）。
      </p>
    </PageShell>
  );
}
