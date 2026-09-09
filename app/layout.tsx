import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  // 正式名称はフェーズ0で決定する（CLAUDE.md 未確定事項）
  title: { default: "一般物販マーケット", template: "%s｜一般物販マーケット" },
  description: "審査を通過したテナントが出品する一般物販マーケットです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        {children}
      </body>
    </html>
  );
}
