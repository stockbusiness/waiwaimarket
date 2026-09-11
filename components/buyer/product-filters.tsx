import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import type { PublicCategory } from "@/lib/products/public";

/**
 * 絞り込み。状態は URL のクエリで持つ。
 *
 * クライアント側の state にしないのは、戻る操作で前の絞り込みへ戻れること、
 * 絞り込んだ結果をそのまま人に送れることのため。検索欄は通常の form
 * （method=get）なので JavaScript が無くても動く。
 */

type Props = {
  categories: PublicCategory[];
  current: { category?: string; q?: string; store?: string };
};

/** いまの絞り込みを保ったまま 1 つだけ差し替えたリンク先を作る */
export function productsHref(
  current: { category?: string; q?: string; store?: string; page?: number },
  patch: Partial<{ category: string | null; q: string | null; page: number | null }>,
): string {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };

  if (next.category) params.set("category", next.category);
  if (next.q) params.set("q", next.q);
  if (next.store) params.set("store", next.store);
  if (next.page && next.page > 1) params.set("page", String(next.page));

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export function ProductFilters({ categories, current }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/products" className="flex gap-2">
        {/* 検索し直しても、いま見ているカテゴリーと店舗は保つ */}
        {current.category ? (
          <input type="hidden" name="category" value={current.category} />
        ) : null}
        {current.store ? (
          <input type="hidden" name="store" value={current.store} />
        ) : null}

        <TextInput
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="商品名で探す"
          maxLength={100}
          aria-label="商品名で探す"
        />
        <Button type="submit" className="shrink-0">
          検索
        </Button>
      </form>

      {categories.length > 0 ? (
        <nav aria-label="カテゴリー" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {current.category ? (
            <Link
              href={productsHref(current, { category: null, page: null })}
              className="rounded-sm text-link hover:underline"
            >
              すべて
            </Link>
          ) : (
            <span aria-current="page" className="font-bold">
              すべて
            </span>
          )}

          {categories.map((category) =>
            category.slug === current.category ? (
              <span key={category.slug} aria-current="page" className="font-bold">
                {category.name}
              </span>
            ) : (
              <Link
                key={category.slug}
                href={productsHref(current, { category: category.slug, page: null })}
                className="rounded-sm text-link hover:underline"
              >
                {category.name}
              </Link>
            ),
          )}
        </nav>
      ) : null}
    </div>
  );
}

/** ページ送り。前後だけ出す（総ページ数が増えても崩れない） */
export function Pagination({
  current,
  page,
  pageCount,
}: {
  current: { category?: string; q?: string; store?: string };
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="ページ送り" className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link
          href={productsHref(current, { page: page - 1 })}
          className="rounded-sm text-link hover:underline"
        >
          ← 前へ
        </Link>
      ) : (
        <span />
      )}

      <span className="text-muted">
        {page} / {pageCount}
      </span>

      {page < pageCount ? (
        <Link
          href={productsHref(current, { page: page + 1 })}
          className="rounded-sm text-link hover:underline"
        >
          次へ →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
