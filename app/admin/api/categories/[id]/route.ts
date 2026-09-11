import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireHqAdmin } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { categorySchema } from "@/lib/validation/product";

/** 商品カテゴリーの更新。本部管理者のみ（docs/00 5.4） */
export async function PUT(
  request: NextRequest,
  context: RouteContext<"/admin/api/categories/[id]">,
) {
  try {
    const hq = await requireHqAdmin();

    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { id } = await context.params;

    // 自分自身を親にすると木が壊れる。0006 の check も同じことを見ているが、
    // 画面には理由の分かる応答を返したい
    if (parsed.data.parentId === id) {
      return Response.json({ error: { reason: "invalid_parent" } }, { status: 422 });
    }

    const { data, error } = await hq.client
      .from("product_categories")
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parent_id: parsed.data.parentId,
        sort_order: parsed.data.sortOrder,
        is_active: parsed.data.isActive,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: { reason: "slug_taken" } }, { status: 409 });
      }
      throw error;
    }
    if (!data) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    await recordAudit({
      actorId: hq.user.id,
      actorRole: hq.role,
      action: "category.update",
      targetTable: "product_categories",
      targetId: id,
      detail: { slug: parsed.data.slug, is_active: parsed.data.isActive },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "カテゴリーの保存に失敗しました");
  }
}
