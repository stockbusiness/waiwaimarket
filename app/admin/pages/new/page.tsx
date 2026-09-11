import { SitePageForm } from "@/components/admin/site-page-form";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqAdmin } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "ページを追加" };

export default async function AdminSitePageNew() {
  // 公開文書の作成は本部管理者のみ（多要素認証込み）
  await withPageGuard("hq", requireHqAdmin);

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/pages", label: "サイトページ" },
          { href: "/admin/pages/new", label: "追加" },
        ]}
      />

      <PageHeader
        title="ページを追加"
        description="保存しただけでは公開されません。内容を確かめてから公開してください。"
      />

      <SitePageForm
        initial={{ slug: "", title: "", sortOrder: 100, body: "" }}
        isPublished={false}
      />
    </PageShell>
  );
}
