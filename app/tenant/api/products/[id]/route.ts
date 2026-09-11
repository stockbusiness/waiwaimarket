import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnProduct } from "@/lib/products/guard";
import { updateProductBody } from "@/lib/products/manage";
import { productBodySchema } from "@/lib/validation/product";

/**
 * 商品本体（表題・説明・カテゴリー）の更新。
 *
 * 公開中の商品を直すと審査待ちへ戻る。戻さないと、きれいな内容で
 * 承認を取ってから中身を差し替えられる（docs/05「未承認商品は公開されない」）。
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnProduct(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const parsed = productBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await updateProductBody(loaded.context.client, {
      productId: id,
      status: loaded.product.status,
      input: parsed.data,
    });

    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: "product.update",
      targetTable: "products",
      targetId: id,
      detail: { title: parsed.data.title, reset_to_review: result.resetToReview ?? false },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ resetToReview: result.resetToReview ?? false });
  } catch (error) {
    return apiErrorResponse(error, "商品の保存に失敗しました");
  }
}
