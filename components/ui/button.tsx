import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * ボタンとリンクの見た目を揃える。
 *
 * 高さを 44px 相当（py-2.5 + text-sm）確保しているのは、
 * スマートフォンで指で押せる大きさにするため。
 */
const VARIANT = {
  primary:
    "bg-accent text-on-accent hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-line-strong bg-raised text-body hover:border-accent disabled:opacity-50",
} as const;

const BASE =
  "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed";

type Variant = keyof typeof VARIANT;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANT[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANT[variant]}`}>
      {children}
    </Link>
  );
}

/** 本文中のリンク。ボタンほど強くしたくない導線に使う */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm underline underline-offset-4 hover:text-muted"
    >
      {children}
    </Link>
  );
}
