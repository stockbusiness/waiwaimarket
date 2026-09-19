import { notFound, redirect } from "next/navigation";

import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { InquiryReply } from "@/components/ui/inquiry-reply";
import { InquiryThread } from "@/components/ui/inquiry-thread";
import { Breadcrumb, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";
import { canPostMessage, INQUIRY_STATUS_LABEL } from "@/lib/inquiries/status";
import { getInquiry } from "@/lib/inquiries/store";

export const metadata = { title: "お問い合わせ" };

/**
 * 1 件のやり取り（0014）。
 *
 * 他人のスレッドは RLS で読めず、そのまま 404 になる。「あなたのものでは
 * ありません」とは出さない（存在を外から確かめられないようにする）。
 */
export default async function BuyerInquiryPage({
  params,
}: PageProps<"/inquiries/[id]">) {
  const { id } = await params;

  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(`/login?next=${encodeURIComponent(`/inquiries/${id}`)}`);
    }
    throw error;
  }

  const inquiry = await getInquiry(context.client, id);
  if (!inquiry) notFound();

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/inquiries", label: "お問い合わせ" },
          { href: `/inquiries/${inquiry.id}`, label: inquiry.productTitle },
        ]}
      />

      <PageHeader
        title={inquiry.productTitle}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
            {inquiry.tenantName ? <span>{inquiry.tenantName}</span> : null}
          </span>
        }
      />

      <p className="text-sm">
        <TextLink href={`/products/${inquiry.productId}`}>商品ページを見る</TextLink>
      </p>

      <section className="flex flex-col gap-3">
        <SectionHeader title="やり取り" />
        <InquiryThread messages={inquiry.messages} viewer="buyer" />
      </section>

      <section className="flex flex-col gap-3">
        {canPostMessage(inquiry.status) ? (
          <InquiryReply
            endpoint={`/api/market/inquiries/${inquiry.id}/messages`}
            label="お店へのご連絡"
          />
        ) : (
          <Alert tone="success">
            このお問い合わせは完了しています。続きがあれば、商品ページから新しくお問い合わせください。
          </Alert>
        )}
      </section>
    </PageShell>
  );
}
