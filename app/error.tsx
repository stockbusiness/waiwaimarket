"use client";

import { useEffect } from "react";

import { ButtonLink, Button } from "@/components/ui/button";
import { Card, PageHeader, PageShell } from "@/components/ui/page";

/**
 * 例外が起きたときの画面。
 *
 * 既定のままだと英語の "Internal Server Error" が出る。404 と同じく
 * 購入者の目に触れる画面なので日本語にし、再試行とトップへの導線を置く。
 *
 * error.message は出さない。サーバー側の例外は Next.js が本番で
 * 内容を伏せて digest だけを渡すが、クライアント側の例外はそのまま
 * 入ってくる。内部の事情を画面に出さない方針を両方で揃える。
 *
 * 代わりに digest を見せる。これはサーバーのログに出る値と同じなので、
 * 問い合わせを受けたときに該当の例外を特定できる。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ブラウザの開発者ツールから追えるようにする。サーバー側は Next.js が記録する
    console.error("画面の描画に失敗しました", error);
  }, [error]);

  return (
    <PageShell width="form">
      <PageHeader
        title="エラーが発生しました"
        description="一時的な問題の可能性があります。少し時間をおいて、もう一度お試しください。"
      />

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          再読み込みする
        </Button>
        <ButtonLink href="/" variant="secondary">
          トップへ戻る
        </ButtonLink>
      </div>

      {error.digest ? (
        <Card>
          <p className="text-sm leading-6 text-muted">
            解消しない場合は、次の番号を添えてお問い合わせください。
          </p>
          <p className="mt-2 font-mono text-sm break-all">{error.digest}</p>
        </Card>
      ) : null}
    </PageShell>
  );
}
