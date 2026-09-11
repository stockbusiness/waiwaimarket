import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "./button";

/**
 * 共通ヘッダー。
 *
 * 上段にロゴ、下段に主要導線を置く 2 段構成。区切りは薄い罫線のみで影は使わない。
 *
 * ロゴの文言は暫定。マーケットの正式名称はフェーズ0 で決める
 * （CLAUDE.md 未確定事項）。決まったらここを差し替える。
 */
function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="rounded-sm text-lg font-bold tracking-tight">
      一般物販マーケット
    </Link>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <header className="border-b border-line bg-raised">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">{children}</div>
    </header>
  );
}

/**
 * 購入者面のヘッダー。
 *
 * 下段の 2 つは「探す側」と「売る側」の入口。商品一覧はフェーズ2 で作るため、
 * 「商品を探す」は当面その案内ページ（トップ）へ向ける。
 */
export function BuyerHeader() {
  return (
    <Bar>
      <div className="flex h-14 items-center justify-between gap-4">
        <Logo href="/" />
        <Link
          href="/login"
          className="rounded-sm text-sm font-medium text-muted hover:text-body"
        >
          ログイン
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-3">
        <ButtonLink href="/" className="w-full">
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
