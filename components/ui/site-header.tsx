import Link from "next/link";
import type { ReactNode } from "react";

import { AwningStripe } from "./awning-stripe";
import { ButtonLink } from "./button";

/**
 * 共通ヘッダー。
 *
 * 上段にロゴ、下段に主要導線を置く 2 段構成。区切りは薄い罫線のみで影は使わない。
 */

/**
 * ロゴ（2026-09-19 に正式データへ差し替え）。
 *
 * **高さ 40px を下回らせない。** 32px にするとロゴ内の「ワイワイマーケット」が
 * 潰れて読めなくなる（Chromium で実測）。ヘッダーの枠は 56px なので収まる。
 *
 * `next/image` を使わない。SVG は最適化の対象外で、`width`/`height` を
 * 要求されるだけになる。比率は 1800:620 で固定なので `h-10 w-auto` で足りる。
 *
 * **紺地に置かないこと。** 文字と W がロゴの紺（#073B82）なので、フッターの
 * 紺地に載せると溶けて読めない。白抜き版はまだ無い。
 *
 * `alt` は日本語表記にする。読み上げで「waiwaimarket」と綴られても
 * 伝わらない（app/layout.tsx のコメントと同じ方針）。
 */
function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="rounded-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="ワイワイマーケット"
        width={1800}
        height={620}
        className="h-10 w-auto"
      />
    </Link>
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
      {/*
        **高さを固定せず、折り返しを許す。** 文字ロゴのときは h-14 に
        4 つの導線が収まっていたが、画像ロゴは 116px あり、390px の画面では
        入りきらない。`flex-wrap` を付けずに詰めると「カート」が
        「カー／ト」と語の途中で割れる（Chromium で実測）。
        狭いときは導線の一群がまるごと次の行へ落ちる。
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <Logo href="/" />
        {/* 各項目が割れないよう whitespace-nowrap。折り返すのは項目の境目だけ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            { href: "/cart", label: "カート" },
            { href: "/orders", label: "注文履歴" },
            { href: "/points", label: "ポイント" },
            { href: "/inquiries", label: "問い合わせ" },
            { href: "/login", label: "ログイン" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm text-sm font-medium whitespace-nowrap text-muted hover:text-body"
            >
              {item.label}
            </Link>
          ))}
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
        {/* 文字ロゴのときは items-baseline で揃えていたが、画像の
            ベースラインは下端なので、面の名前が下にずれる。中央で揃える */}
        <div className="flex items-center gap-2 overflow-hidden">
          <Logo href={home} />
          <span className="shrink-0 text-xs font-medium text-muted">{label}</span>
        </div>
        {children}
      </div>
    </Bar>
  );
}
