import Link from "next/link";
import { redirect } from "next/navigation";

import { MfaEnrollment } from "@/components/admin/mfa-enrollment";
import { requireHqOperator } from "@/lib/auth/guard";
import { getMfaStatus } from "@/lib/auth/mfa";
import { withPageGuard } from "@/lib/auth/page-guard";
import { satisfiesHqAdminAssurance } from "@/lib/auth/roles";

export const metadata = { title: "多要素認証" };

export default async function AdminMfaPage() {
  // requireHqAdmin は AAL2 を要求するため、この画面では使えない（自分自身を閉め出す）
  const context = await withPageGuard("hq", requireHqOperator);
  const status = await getMfaStatus(context.client);

  if (satisfiesHqAdminAssurance(status.currentLevel)) {
    redirect("/admin");
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">多要素認証</h1>
        <p className="text-sm leading-6 text-zinc-600">
          本部管理者の操作（ルール設定、精算確定、手動調整の承認、テナントの停止）には
          多要素認証が必要です。審査・承認・差戻しは設定前でも行えます。
        </p>
      </header>

      <MfaEnrollment alreadyVerified={status.hasVerifiedFactor} />

      <Link href="/admin" className="text-sm underline underline-offset-2">
        本部管理へ戻る
      </Link>
    </main>
  );
}
