import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "./button";

/**
 * 共通ヘッダー。
 *
 * 上段にロゴ、下段に主要導線を置く 2 段構成。区切りは薄い罫線のみで影は使わない。
 */

/**
 * ロゴ。
 *
 * **画像ではなく文字で出している。** ロゴ画像の正式データ（背景が透明な SVG）が
 * まだ無いため。JPG をそのまま置くと白い四角が背景に残り、暗い面で浮く。
 * データが届いたら `img` に差し替える（高さは 56px の枠に収める）。
 *
 * 文言は日本語表記で固定する（app/layout.tsx のコメント参照）。
 */
function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="rounded-sm text-lg font-bold tracking-tight">
      ワイワイマーケット
    </Link>
  );
}

/**
 * 幌のストライプ。ロゴのマークをそのまま細い帯にしたもの。
 *
 * ブランドの朱・黄・ティールは文字に使えない（白地でのコントラストが
 * 3.38 / 1.77 / 3.23 で AA に届かない。app/globals.css 参照）。
 * 面にしか置けないので、ここで画面の一番上に出してロゴとつなげる。
 *
 * 並び順はロゴを実測して合わせてある（朱→黄→ティール→黄）。
 * 装飾なので読み上げからは外す。
 */
function AwningStripe() {
  return (
    <div aria-hidden className="flex h-1">
      <div className="flex-1 bg-brand-coral" />
      <div className="flex-1 bg-brand-amber" />
      <div className="flex-1 bg-brand-teal" />
      <div className="flex-1 bg-brand-amber" />
    </div>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <header className="border-b border-line bg-raised">
      <AwningStripe />
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">{children}</div>
    </header>
  );
}

/**
 * 購入者面のヘッダー。
 *
 * 下段の 2 つは「探す側」と「売る側」の入口。
 */
export function BuyerHeader() {
  return (
    <Bar>
      <div className="flex h-14 items-center justify-between gap-4">
        <Logo href="/" />
        <div className="flex items-center gap-4">
          <Link
            href="/cart"
            className="rounded-sm text-sm font-medium text-muted hover:text-body"
          >
            カート
          </Link>
          <Link
            href="/login"
            className="rounded-sm text-sm font-medium text-muted hover:text-body"
          >
            ログイン
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-3">
        <ButtonLink href="/products" className="w-full">
          商品を探す
        </ButtonLink>
        <ButtonLink href="/tenant/login" variant="secondary" className="w-full">
          出店する
        </ButtonLink>
      </div>
    </Bar>
  );
}

/**
 * テナント面・本部面のヘッダー。
 *
 * 管理画面なので購入者向けの CTA は出さない。誰として入っているかを常に見せる。
 */
export function ConsoleHeader({
  label,
  home,
  children,
}: {
  /** 「テナント管理」「本部管理」など、いまどの面にいるか */
  label: string;
  home: string;
  /** ログアウトなど右側に置く操作 */
  children?: ReactNode;
}) {
  return (
    <Bar>
      <div className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-baseline gap-2 overflow-hidden">
          <Logo href={home} />
          <span className="shrink-0 text-xs font-medium text-muted">{label}</span>
        </div>
        {children}
      </div>
    </Bar>
  );
}
