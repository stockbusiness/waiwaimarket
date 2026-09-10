import { SignOutButton } from "@/components/auth/sign-out-button";
import { Alert } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/page";
import { requireHqOperator } from "@/lib/auth/guard";
import { withPageGuard } from "@/lib/auth/page-guard";

export const metadata = { title: "本部管理" };

export default async function AdminHome() {
  const context = await withPageGuard("hq", requireHqOperator);
  const needsMfa =
    context.role === "hq_admin" && context.assuranceLevel !== "aal2";

  return (
    <PageShell>
      <PageHeader
        title="本部管理"
        description={`${context.user.email}（${
          context.role === "hq_admin" ? "本部管理者" : "本部オペレーター"
        }）`}
        actions={<SignOutButton audience="hq" />}
      />

      {needsMfa ? (
        <Alert tone="warning">
          多要素認証が未設定です。設定するまでルール変更・精算確定・手動調整は行えません。
          <span className="ml-1">
            <TextLink href="/admin/mfa">設定する</TextLink>
          </span>
        </Alert>
      ) : null}

      <nav aria-label="本部メニュー" className="flex flex-col gap-3 text-sm">
        <TextLink href="/admin/tenants">テナント審査</TextLink>
      </nav>
    </PageShell>
  );
}
