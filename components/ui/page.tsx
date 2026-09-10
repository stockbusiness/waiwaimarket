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
      className={`mx-auto flex w-full ${WIDTH[width]} flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14`}
    >
      {children}
    </main>
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-raised p-4 sm:p-5">{children}</div>
  );
}
