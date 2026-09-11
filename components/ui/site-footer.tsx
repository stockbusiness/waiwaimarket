import Link from "next/link";

/**
 * 共通フッター。黒地に白文字のリンク一覧。
 *
 * 掲載するのは実在する画面だけにする。規約やポリシーのページはまだ無いので、
 * 用意できてから足す。リンク切れを置くほうが、項目が少ないことより悪い。
 */
const SECTIONS = [
  {
    heading: "マーケットについて",
    links: [{ href: "/", label: "トップ" }],
  },
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

export function SiteFooter() {
  return (
    // 暗い面では本文の背景（#0b0b0c）とフッターの黒がほぼ同じになり、
    // 境目が見えなくなる。罫線で区切る。
    <footer className="mt-auto border-t border-line bg-footer text-on-footer">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {SECTIONS.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              <h2 className="text-xs font-medium text-on-footer-muted">
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

        <p className="mt-10 text-xs text-on-footer-muted">
          販売者は各テナントです。決済と精算はマーケット運営本部が代行します。
        </p>
      </div>
    </footer>
  );
}
