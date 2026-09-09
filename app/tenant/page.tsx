import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import type { TenantStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "テナント管理" };

const STATUS_LABEL: Record<TenantStatus, string> = {
  applied: "申請済み（審査待ち）",
  under_review: "審査中",
  approved: "承認済み",
  suspended: "停止中",
  rejected: "差し戻し",
};

export default async function TenantHome() {
  const context = await withPageGuard("tenant", requireTenantUser);

  if (context.memberships.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">テナント管理</h1>
          <SignOutButton audience="tenant" />
        </header>
        <p className="text-sm leading-6">
          まだ出店申請が行われていません。
        </p>
        <Link href="/tenant/apply" className="w-fit rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          出店を申請する
        </Link>
      </main>
    );
  }

  // 0004 の tenants_member_read で自分の所属テナントだけが返る
  const { data: tenants } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
    .in("id", context.memberships.map((m) => m.tenantId));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">テナント管理</h1>
          <p className="text-sm text-zinc-600">{context.user.email}</p>
        </div>
        <SignOutButton audience="tenant" />
      </header>

      <ul className="flex flex-col gap-4">
        {(tenants ?? []).map((tenant) => {
          const membership = context.memberships.find((m) => m.tenantId === tenant.id);
          const stripeDone =
            tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled;

          return (
            <li key={tenant.id} className="rounded border border-zinc-200 p-4">
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-base font-medium">{tenant.name}</p>
                <p className="text-zinc-600">
                  審査状態：{STATUS_LABEL[tenant.status]}／
                  Stripe：{stripeDone ? "完了" : "未完了"}／
                  権限：{membership?.role === "owner" ? "管理者" : "担当者"}
                </p>
                <div className="flex flex-wrap gap-4">
                  {membership?.role === "owner" && !stripeDone ? (
                    <Link href="/tenant/onboarding" className="underline underline-offset-2">
                      Stripe の手続きへ
                    </Link>
                  ) : null}
                  <Link href="/tenant/store" className="underline underline-offset-2">
                    店舗ページ
                  </Link>
                  {membership?.role === "owner" ? (
                    <Link
                      href="/tenant/settings/legal"
                      className="underline underline-offset-2"
                    >
                      事業者情報
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
