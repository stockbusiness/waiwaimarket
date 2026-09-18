import type { Metadata } from "next";

import "./globals.css";

/**
 * 正式名称は「ワイワイマーケット」（英字表記 waiwaimarket、2026-09-18 決定）。
 *
 * **画面の文字は日本語表記にする。** 購入者は日本語圏で、検索やブックマークで
 * 読み取りやすい。英字の `waiwaimarket` はロゴ画像とメールの差出人名に使う。
 * 英字は小文字・1 語で固定する（WaiWai Market のような表記ゆれを作らない）。
 */
export const metadata: Metadata = {
  title: { default: "ワイワイマーケット", template: "%s｜ワイワイマーケット" },
  description: "審査を通過したテナントが出品するワイワイマーケットです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface font-sans text-body">
        {children}
      </body>
    </html>
  );
}
