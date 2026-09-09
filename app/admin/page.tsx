import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "本部管理" };

export default async function AdminHome() {
  const context = await withPageGuard("hq", requireHqOperator);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">本部管理</h1>
          <p className="text-sm text-zinc-600">
            {context.user.email}（
            {context.role === "hq_admin" ? "本部管理者" : "本部オペレーター"}）
          </p>
        </div>
        <SignOutButton audience="hq" />
      </header>

      <Link href="/admin/tenants" className="w-fit underline underline-offset-2">
        テナント審査
      </Link>

      <p className="text-sm leading-6">
        {context.role === "hq_admin" &&
        context.assuranceLevel !== "aal2"
          ? "　多要素認証が未設定です。設定するまでルール変更・精算確定・手動調整は行えません。"
          : null}
      </p>
    </main>
  );
}
