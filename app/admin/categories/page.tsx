import { CategoryManager } from "@/components/admin/category-manager";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { requireHqAdmin } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import { listCategories } from "@/lib/products/categories";

export const metadata = { title: "商品カテゴリー" };

/**
 * 商品カテゴリーの管理（docs/00 5.3）。
 *
 * 本部管理者のみ。オペレーターに開けていないのは、カテゴリーが
 * 公開画面の構造そのもので、docs/00 5.4 の「ルール変更は不可」に当たるため。
 */
export default async function AdminCategoriesPage() {
  const context = await withPageGuard("hq", requireHqAdmin);
  const categories = await listCategories(context.client);

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { href: "/admin", label: "本部管理" },
          { href: "/admin/categories", label: "商品カテゴリー" },
        ]}
      />

      <PageHeader
        title="商品カテゴリー"
        description="テナントは商品を審査に出す前にカテゴリーを選びます。使わなくなったものは削除せず「使わない」にしてください。"
      />

      <CategoryManager categories={categories} />
    </PageShell>
  );
}
