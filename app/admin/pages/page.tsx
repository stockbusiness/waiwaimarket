import { Badge } from "@/components/ui/alert";
import { ButtonLink, TextLink } from "@/components/ui/button";
import { Breadcrumb, Card, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listSitePages } from "@/lib/site/admin";

export const metadata = { title: "サイトページ" };

/**
 * 利用規約・プライバシーポリシー・特商法表記・会社概要などの一覧。
 *
 * 閲覧は本部オペレーターまで、編集は本部管理者のみ（docs/00 5.4）。
 * ここでは一覧を出すだけなので requireHqOperator でよい。
 */
export default async function AdminSitePagesList() {
  const context = await withPageGuard("hq", requireHqOperator);
  const pages = await listSitePages();
  const canEdit = context.role === "hq_admin";

  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/pages", label: "サイトページ" },
        ]}
      />

      <PageHeader
        title="サイトページ"
        description="利用規約・プライバシーポリシー・特定商取引法に基づく表記・会社概要など、マーケット全体の文書を編集します。"
        actions={
          canEdit ? <ButtonLink href="/admin/pages/new">ページを追加</ButtonLink> : null
        }
      />

      {canEdit ? null : (
        <p className="text-sm text-muted">
          編集できるのは本部管理者のみです。内容の確認のみ行えます。
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {pages.map((page) => (
          <li key={page.id}>
            <Card>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <TextLink href={`/admin/pages/${page.id}`}>
                    <span className="font-medium">{page.title}</span>
                  </TextLink>
                  <Badge>{page.isPublished ? "公開中" : "下書き"}</Badge>
                </div>
                <p className="font-mono text-xs text-muted">/legal/{page.slug}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {pages.length === 0 ? (
        <p className="text-sm text-muted">まだページがありません。</p>
      ) : null}
    </PageShell>
  );
}
