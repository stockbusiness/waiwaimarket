import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireTenantUser } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "テナント管理" };

export default async function TenantHome() {
  const context = await withPageGuard("tenant", requireTenantUser);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">テナント管理</h1>
          <p className="text-sm text-zinc-600">{context.user.email}</p>
        </div>
        <SignOutButton audience="tenant" />
      </header>

      {context.memberships.length === 0 ? (
        <p className="text-sm leading-6">
          まだ出店申請が行われていません。出店申請の画面は次の変更で追加します。
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {context.memberships.map((membership) => (
            <li key={membership.tenantId}>
              {membership.tenantId}（
              {membership.role === "owner" ? "管理者" : "担当者"}）
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
