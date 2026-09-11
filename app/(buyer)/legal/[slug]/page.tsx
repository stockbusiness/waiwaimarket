import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/ui/markdown";
import { PageHeader, PageShell } from "@/components/ui/page";
import { getPublishedPage } from "@/lib/site/pages";

/**
 * 本部が管理する公開ページ（利用規約・プライバシーポリシー・
 * 特定商取引法に基づく表記・会社概要など）。
 *
 * 未公開のページと存在しない slug は 404 にする。「準備中」を出すと、
 * 掲示が必要な文書が無いことに気づきにくくなる。
 */

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "long",
  timeZone: "Asia/Tokyo",
});

export async function generateMetadata({
  params,
}: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  return { title: page?.title ?? "ページが見つかりません" };
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) notFound();

  return (
    <PageShell>
      <PageHeader
        title={page.title}
        description={`最終改定：${DATE_FORMAT.format(new Date(page.revisedAt))}`}
      />
      <Markdown source={page.body} />
    </PageShell>
  );
}
