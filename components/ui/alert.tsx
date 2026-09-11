import type { ReactNode } from "react";

/**
 * 通知。エラーは role="alert" を付けて読み上げ対象にする。
 *
 * 色だけで種類を伝えないよう、先頭に文字のラベルを置く。
 */
const TONE = {
  error: {
    label: "エラー",
    className: "border-danger/40 bg-danger-surface text-danger",
  },
  warning: {
    label: "注意",
    className: "border-warning/40 bg-warning-surface text-warning",
  },
  success: {
    label: "完了",
    className: "border-success/40 bg-surface text-success",
  },
} as const;

export type AlertTone = keyof typeof TONE;

export function Alert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  const { label, className } = TONE[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2.5 text-sm leading-6 ${className}`}
    >
      <span className="font-medium">{label}：</span>
      {children}
    </p>
  );
}

/** 一覧や見出しの横に出す状態表示 */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">
      {children}
    </span>
  );
}
