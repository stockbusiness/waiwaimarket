import Link from "next/link";

import { listPublishedPages } from "@/lib/site/pages";

/**
 * 共通フッター。主要操作と同じ青地に白文字のリンク一覧。
 *
 * 掲載するのは実在する画面だけにする。リンク切れを置くほうが、
 * 項目が少ないことより悪い。「マーケットについて」の列は本部が
 * 管理画面で公開したページ（利用規約・プライバシーポリシー・
 * 特商法表記・会社概要など）を並べる。未公開のものは出ない。
 */
const FIXED_SECTIONS = [
  {
    heading: "出店をお考えの方",
    links: [
      { href: "/tenant/login", label: "テナントログイン" },
      { href: "/tenant/apply", label: "出店申請" },
    ],
  },
  {
    heading: "運営",
    links: [{ href: "/admin/login", label: "本部ログイン" }],
  },
];

export async function SiteFooter() {
  const pages = await listPublishedPages();

  const sections = [
    {
      heading: "マーケットについて",
      links: [
        { href: "/", label: "トップ" },
        ...pages.map((page) => ({ href: `/legal/${page.slug}`, label: page.title })),
      ],
    },
    ...FIXED_SECTIONS,
  ];

  return (
    <footer className="mt-auto bg-footer text-on-footer">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {sections.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              {/* 色を落とすとコントラストが AA を切るため、階層は大きさと太さで付ける */}
              <h2 className="text-xs font-bold tracking-wide opacity-95">
                {section.heading}
              </h2>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                {section.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="rounded-sm hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-10 text-xs leading-5">
          販売者は各テナントです。決済と精算はマーケット運営本部が代行します。
        </p>
      </div>
    </footer>
  );
}
