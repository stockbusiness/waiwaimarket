import { LoginPage } from "@/components/auth/login-page";
import { firstParam } from "@/lib/auth/search-params";

export const metadata = { title: "本部ログイン" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  return (
    <LoginPage
      audience="hq"
      title="本部ログイン"
      description="本部運営者向けの管理画面です。登録された担当者のみ利用できます。"
      next={firstParam(params.next)}
      error={firstParam(params.error)}
    />
  );
}
