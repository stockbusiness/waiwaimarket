import "server-only";

import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 商品カテゴリー（docs/00 5.3「カテゴリー・特集管理」）。
 *
 * 0006 の product_categories_public_read が有効なカテゴリーだけを見せ、
 * 本部だけが無効なものも読める。書き込みは本部管理者のみ。
 */

export type CategoryOption = { id: string; label: string };

export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
};

/**
 * 選択肢。親子を「親 › 子」の 1 行にして返す。
 *
 * 入れ子の select は端末によって表示が崩れるため、階層は文字で示す。
 * 深さの制限はここでは見ない（0006 のコメントどおりアプリ側の責任だが、
 * 表示は 2 階層を超えても壊れない）。
 */
export async function listCategoryOptions(
  client: MarketSupabaseClient,
): Promise<CategoryOption[]> {
  const { data, error } = await client
    .from("product_categories")
    .select("id, parent_id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) throw error;

  const rows = data ?? [];
  const nameById = new Map(rows.map((row) => [row.id, row.name]));

  return rows.map((row) => {
    const parentName = row.parent_id ? nameById.get(row.parent_id) : undefined;
    return {
      id: row.id,
      label: parentName ? `${parentName} › ${row.name}` : row.name,
    };
  });
}

/** 本部の管理画面用。無効なものも含めて全件 */
export async function listCategories(
  client: MarketSupabaseClient,
): Promise<CategoryRow[]> {
  const { data, error } = await client
    .from("product_categories")
    .select("id, parent_id, name, slug, sort_order, is_active")
    .order("sort_order")
    .order("name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}
