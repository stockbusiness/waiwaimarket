import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { requireTenantMember } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { createProduct } from "@/lib/products/manage";
import { productBodySchema } from "@/lib/validation/product";

/**
 * 商品の新規作成（docs/06 フェーズ2-1）。
 *
 * 作るのは本体だけ。SKU と画像は作成後の編集画面で足す。
 * 画像の置き場所が `<tenant_id>/<product_id>/...`（0008）なので、
 * 商品 ID が決まる前にはアップロードできない。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const context = await requireTenantMember(body.tenantId);

    const parsed = productBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await createProduct(context.client, {
      tenantId: body.tenantId,
      input: parsed.data,
    });
    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    await recordAudit({
      actorId: context.user.id,
      actorRole: "tenant_member",
      action: "product.create",
      targetTable: "products",
      targetId: result.id,
      detail: { title: parsed.data.title },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "商品の作成に失敗しました");
  }
}
