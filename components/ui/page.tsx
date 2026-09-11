import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 画面の外枠。余白と最大幅を 1 か所に集める。
 *
 * これまで各画面が mx-auto flex w-full max-w-2xl ... を手書きしていたため、
 * 画面ごとに余白が少しずつ違っていた。
 */
const WIDTH = {
  form: "max-w-md",
  page: "max-w-2xl",
  wide: "max-w-4xl",
} as const;

type Props = {
  width?: keyof typeof WIDTH;
  children: ReactNode;
};

export function PageShell({ width = "page", children }: Props) {
  return (
    <main
      className={`mx-auto flex w-full ${WIDTH[width]} flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10`}
    >
      {children}
    </main>
  );
}

export type Crumb = { href: string; label: string };

/**
 * パンくず。いまどこにいるかと、1 つ上へ戻る手段を兼ねる。
 * 最後の項目は現在地なのでリンクにしない。
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="パンくず" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-2">
              {isLast ? (
                <span aria-current="page" className="text-muted">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="rounded-sm text-link hover:underline">
                  {item.label}
                </Link>
              )}
              {isLast ? null : (
                <span aria-hidden className="text-subtle">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type HeaderProps = {
  title: string;
  description?: ReactNode;
  /** 右側に置く操作（ログアウトなど）。狭い画面では下へ回り込む */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: HeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

/** セクションの見出し。右側に「すべて見る」のような導線を置ける */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-raised p-4 sm:p-5">{children}</div>
  );
}
