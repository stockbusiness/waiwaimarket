import { notFound } from "next/navigation";

import { SitePageForm } from "@/components/admin/site-page-form";
import { Alert, Badge } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqAdmin } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { getSitePage } from "@/lib/site/admin";

export const metadata = { title: "ページの編集" };

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function AdminSitePageEdit({
  params,
}: PageProps<"/admin/pages/[id]">) {
  await withPageGuard("hq", requireHqAdmin);

  const { id } = await params;
  const page = await getSitePage(id);
  if (!page) notFound();

  // 公開中の版と、編集欄に出す本文。未公開なら最新の下書きを続きから編集する
  const latest = page.revisions[0];

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/pages", label: "サイトページ" },
          { href: `/admin/pages/${page.id}`, label: page.title },
        ]}
      />

      <PageHeader
        title={page.title}
        description={
          <>
            <Badge>{page.isPublished ? "公開中" : "下書き"}</Badge>
            {page.isPublished ? (
              <span className="ml-2">
                <TextLink href={`/legal/${page.slug}`}>公開ページを見る</TextLink>
              </span>
            ) : null}
          </>
        }
      />

      {page.isPublished ? null : (
        <Alert tone="warning">
          このページはまだ公開されていません。フッターにも表示されません。
        </Alert>
      )}

      <SitePageForm
        pageId={page.id}
        initial={{
          slug: page.slug,
          title: page.title,
          sortOrder: page.sortOrder,
          body: latest?.body ?? "",
        }}
        isPublished={page.isPublished}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold tracking-tight">改定履歴</h2>
        <ul className="flex flex-col gap-3">
          {page.revisions.map((revision) => (
            <li key={revision.id}>
              <Card>
                <div className="flex flex-col gap-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">第 {revision.revisionNumber} 版</span>
                    {revision.isPublished ? <Badge>公開中</Badge> : null}
                  </div>
                  <p className="text-muted">
                    {DATE_FORMAT.format(new Date(revision.createdAt))}
                  </p>
                  {revision.note ? <p className="text-muted">{revision.note}</p> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {page.revisions.length === 0 ? (
          <p className="text-sm text-muted">まだ本文が保存されていません。</p>
        ) : null}
      </section>
    </PageShell>
  );
}
