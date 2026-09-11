import type { NextRequest } from "next/server";

import { requireHqAdmin, requireHqOperator } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { reviewProduct } from "@/lib/products/review";
import { reviewRequiresHqAdmin } from "@/lib/products/status";
import { productReviewSchema } from "@/lib/validation/product";

/**
 * 商品の承認・差戻し・販売停止・復帰（docs/00 5.3、docs/06 フェーズ2-2）。
 *
 * 販売停止と復帰は本部管理者のみ。テナント審査
 * （/admin/api/tenants/{id}/review）と同じ切り分けにしてある。
 * requireHqAdmin は AAL2 を要求する。
 *
 * ここは action で権限が変わるため、入力検証を認可より先に行う。
 * 未認証でも 422 が返るが、返しているのは「action の形が不正」という
 * 事実だけで、商品の存在や内容は漏れない。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/admin/api/products/[id]/review">,
) {
  try {
    const parsed = productReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { action, note } = parsed.data;
    const hq = reviewRequiresHqAdmin(action)
      ? await requireHqAdmin()
      : await requireHqOperator();

    const { id } = await context.params;
    const result = await reviewProduct(hq.client, {
      productId: id,
      action,
      actorId: hq.user.id,
      actorRole: hq.role,
      note,
      ip: request.headers.get("x-forwarded-for"),
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ status: result.status });
  } catch (error) {
    return apiErrorResponse(error, "商品審査に失敗しました");
  }
}
