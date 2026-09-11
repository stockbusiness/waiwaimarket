import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, PageShell } from "@/components/ui/page";

export const metadata = { title: "ページが見つかりません" };

/**
 * 404 画面。
 *
 * 既定のままだと英語の "This page could not be found." が出る。
 * 購入者が商品や店舗の URL を打ち間違えたときにも表示されるため、
 * 日本語にしたうえでトップへ戻る導線を置く。
 *
 * 店舗ページは、未公開・未承認・停止中のテナントでも 404 になる
 * （0004 の stores_public_read で絞っている）。存在しないのか出店前なのかを
 * 区別して伝えると、どのテナントが審査中かを外部に知らせることになるため、
 * 区別せずに「公開前の可能性がある」とだけ案内する。
 */
export default function NotFound() {
  return (
    <PageShell width="form">
      <PageHeader
        title="ページが見つかりません"
        description="URL が変更されたか、削除された可能性があります。"
      />

      <Card>
        {/* 和文の途中で改行すると JSX が空白に変換するため、1 行で書く */}
        <p className="text-sm leading-6 text-muted">
          店舗ページを開こうとした場合は、URL が正しくても、出店の準備中でまだ公開されていないことがあります。
        </p>
      </Card>

      <div>
        <ButtonLink href="/">トップへ戻る</ButtonLink>
      </div>
    </PageShell>
  );
}
