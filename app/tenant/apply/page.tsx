import { redirect } from "next/navigation";

import { TenantApplicationForm } from "@/components/tenant/application-form";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "出店申請" };

export default async function TenantApplyPage() {
  const context = await withPageGuard("tenant", requireTenantUser);

  // すでに所属があるなら申請済み
  if (context.memberships.length > 0) redirect("/tenant");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">出店申請</h1>
        <p className="text-sm leading-6 text-zinc-600">
          事業者情報を登録すると審査に進みます。審査の通過に加えて
          Stripe の手続きの完了が出店の条件です。
        </p>
      </header>

      <TenantApplicationForm />
    </main>
  );
}
