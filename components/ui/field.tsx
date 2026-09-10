import type { ComponentProps, ReactNode } from "react";

/**
 * 入力欄。ラベル・補足・必須表示をまとめる。
 *
 * text-base（16px）を保つのは、iOS Safari が 16px 未満の入力欄に
 * 焦点を当てたときに画面を勝手に拡大するため。
 */
const CONTROL =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body placeholder:text-subtle";

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
};

export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">
        {label}
        {required ? (
          <span className="font-normal text-muted">（必須）</span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="text-xs leading-5 text-subtle">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${CONTROL} ${className}`} {...props} />;
}
