import { LoginPage } from "@/components/auth/login-page";
import { firstParam } from "@/lib/auth/search-params";

export const metadata = { title: "ログイン" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  return (
    <LoginPage
      audience="buyer"
      title="ログイン"
      description="登録したメールアドレスに確認メールをお送りします。"
      next={firstParam(params.next)}
      error={firstParam(params.error)}
    />
  );
}
