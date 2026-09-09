import { LoginPage } from "@/components/auth/login-page";
import { firstParam } from "@/lib/auth/search-params";

export const metadata = { title: "テナントログイン" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  return (
    <LoginPage
      audience="tenant"
      title="テナントログイン"
      description="出店者向けの管理画面です。購入者アカウントとは別のセッションになります。"
      next={firstParam(params.next)}
      error={firstParam(params.error)}
    />
  );
}
