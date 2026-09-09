import Link from "next/link";

import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";
import type { TenantStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "テナント審査" };

const STATUS_LABEL: Record<TenantStatus, string> = {
  applied: "申請済み",
  under_review: "審査中",
  approved: "承認済み",
  suspended: "停止中",
  rejected: "差し戻し",
};

export default async function AdminTenantsPage() {
  const context = await withPageGuard("hq", requireHqOperator);

  // 本部は 0002 の hq_read_tenants で全件を読める。service_role は使わない。
  const { data: tenants, error } = await context.client
    .from("tenants")
    .select("id, name, status, stripe_charges_enabled, stripe_payouts_enabled, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">テナント審査</h1>
        <p className="text-sm text-zinc-600">{tenants?.length ?? 0} 件</p>
      </header>

      <ul className="flex flex-col gap-2">
        {(tenants ?? []).map((tenant) => (
          <li key={tenant.id} className="rounded border border-zinc-200 p-4 text-sm">
            <Link href={`/admin/tenants/${tenant.id}`} className="font-medium underline underline-offset-2">
              {tenant.name}
            </Link>
            <p className="mt-1 text-zinc-600">
              {STATUS_LABEL[tenant.status]}／Stripe：
              {tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled
                ? "完了"
                : "未完了"}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
