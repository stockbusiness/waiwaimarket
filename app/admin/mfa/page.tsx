import { redirect } from "next/navigation";

import { MfaEnrollment } from "@/components/admin/mfa-enrollment";
import { TextLink } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/page";
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
    <PageShell width="form">
      <PageHeader
        title="多要素認証"
        description="本部管理者の操作（ルール設定、精算確定、手動調整の承認、テナントの停止）には多要素認証が必要です。審査・承認・差戻しは設定前でも行えます。"
      />

      <MfaEnrollment alreadyVerified={status.hasVerifiedFactor} />

      <p className="text-sm">
        <TextLink href="/admin">本部管理へ戻る</TextLink>
      </p>
    </PageShell>
  );
}
