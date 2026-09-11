import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireHqAdmin } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { categorySchema } from "@/lib/validation/product";

/**
 * 商品カテゴリーの追加（docs/00 5.3「カテゴリー・特集管理」）。
 *
 * 0006 の product_categories_hq_admin_write が効くので、本部管理者の
 * セッションのまま書ける。service_role は使わない（RLS も効かせる）。
 */
export async function POST(request: NextRequest) {
  try {
    // 認可を先に通す。未認証の相手に入力検証の結果を返さない
    const hq = await requireHqAdmin();

    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { data, error } = await hq.client
      .from("product_categories")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parent_id: parsed.data.parentId,
        sort_order: parsed.data.sortOrder,
        is_active: parsed.data.isActive,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: { reason: "slug_taken" } }, { status: 409 });
      }
      throw error;
    }

    await recordAudit({
      actorId: hq.user.id,
      actorRole: hq.role,
      action: "category.create",
      targetTable: "product_categories",
      targetId: data.id,
      detail: { slug: parsed.data.slug, name: parsed.data.name },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ id: data.id });
  } catch (error) {
    return apiErrorResponse(error, "カテゴリーの作成に失敗しました");
  }
}
