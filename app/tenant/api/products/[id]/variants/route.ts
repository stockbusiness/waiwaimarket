import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnProduct } from "@/lib/products/guard";
import { saveVariants } from "@/lib/products/manage";
import { variantsSchema } from "@/lib/validation/product";

/**
 * SKU・価格・在庫の一括保存（送られてこなかった既存行は削除）。
 *
 * 1 画面で編集するため行ごとの API にしない。個別 API にすると、
 * 途中で失敗したときに画面と DB がずれる。
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]/variants">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnProduct(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const body = (await request.json()) as { variants?: unknown };
    const parsed = variantsSchema.safeParse(body.variants);
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await saveVariants(loaded.context.client, {
      productId: id,
      rows: parsed.data,
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    await recordAudit({
      actorId: loaded.context.user.id,
      actorRole: "tenant_member",
      action: "product.variants.update",
      targetTable: "products",
      targetId: id,
      detail: { count: parsed.data.length },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "SKU の保存に失敗しました");
  }
}
