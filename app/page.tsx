import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">一般物販マーケット</h1>
        <p className="text-sm text-zinc-600">
          フェーズ1（共通基盤とテナント管理）を実装中です。
          商品一覧と購入導線はフェーズ2以降で追加します。
        </p>
      </header>

      <nav className="flex flex-col gap-3 text-sm">
        <Link href="/login" className="underline underline-offset-2">
          購入者ログイン
        </Link>
        <Link href="/tenant/login" className="underline underline-offset-2">
          テナントログイン
        </Link>
        <Link href="/admin/login" className="underline underline-offset-2">
          本部ログイン
        </Link>
      </nav>
    </main>
  );
}
