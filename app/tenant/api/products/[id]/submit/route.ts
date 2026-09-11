import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnProduct } from "@/lib/products/guard";
import { setProductStatus } from "@/lib/products/manage";
import {
  canTenantTransition,
  nextTenantStatus,
  submitBlockers,
  type ProductTenantAction,
} from "@/lib/products/status";

/**
 * 審査への提出（docs/04 9.2、docs/06 フェーズ2-1）。
 *
 *   POST   … 審査に出す
 *   DELETE … 提出を取り下げる（審査待ちのあいだだけ）
 *
 * 承認・差戻しはここでは行えない。テナントのセッションで status を
 * approved にすると 0010 のトリガが例外で拒否する。
 */

async function act(
  request: NextRequest,
  productId: string,
  action: ProductTenantAction,
): Promise<Response> {
  const loaded = await loadOwnProduct(productId);
  if (!loaded) {
    return Response.json({ error: { reason: "not_found" } }, { status: 404 });
  }

  if (!canTenantTransition(loaded.product.status, action)) {
    return Response.json({ error: { reason: "invalid_transition" } }, { status: 409 });
  }

  if (action === "submit") {
    const blockers = submitBlockers({
      variantCount: loaded.product.variants.length,
      imageCount: loaded.product.images.length,
      hasCategory: loaded.product.categoryId !== null,
    });
    if (blockers.length > 0) {
      return Response.json({ error: { reason: "blocked", blockers } }, { status: 409 });
    }
  }

  const to = nextTenantStatus(action);
  const result = await setProductStatus(loaded.context.client, { productId, to });
  if (!result.ok) {
    return Response.json({ error: { reason: result.reason } }, { status: 404 });
  }

  await recordAudit({
    actorId: loaded.context.user.id,
    actorRole: "tenant_member",
    action: `product.${action}`,
    targetTable: "products",
    targetId: productId,
    detail: { from: loaded.product.status, to },
    ip: request.headers.get("x-forwarded-for"),
  });

  return Response.json({ status: to });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]/submit">,
) {
  try {
    const { id } = await context.params;
    return await act(request, id, "submit");
  } catch (error) {
    return apiErrorResponse(error, "審査への提出に失敗しました");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]/submit">,
) {
  try {
    const { id } = await context.params;
    return await act(request, id, "withdraw");
  } catch (error) {
    return apiErrorResponse(error, "審査の取り下げに失敗しました");
  }
}
