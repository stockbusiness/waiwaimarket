import type { NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/http/errors";
import { requireHqAdmin, requireHqOperator } from "@/lib/auth/guard";
import { reviewTenant } from "@/lib/tenants/review";
import { requiresHqAdmin } from "@/lib/tenants/status";
import { tenantReviewSchema } from "@/lib/validation/tenant";

/**
 * テナントの審査・承認・差戻し・停止（docs/00 5.3）。
 * 停止と復帰は本部管理者のみ。本部管理者には多要素認証を課しているため、
 * requireHqAdmin は AAL2 を要求する。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/admin/api/tenants/[id]/review">,
) {
  try {
    const parsed = tenantReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { action, reason } = parsed.data;
    const hq = requiresHqAdmin(action)
      ? await requireHqAdmin()
      : await requireHqOperator();

    const { id } = await context.params;
    const result = await reviewTenant({
      tenantId: id,
      action,
      actorId: hq.user.id,
      actorRole: hq.role,
      reason,
      ip: request.headers.get("x-forwarded-for"),
    });

    if (!result.ok) {
      const status =
        result.reason === "not_found" ? 404 : result.reason === "blocked" ? 409 : 400;
      return Response.json(
        { error: { reason: result.reason, blockers: result.blockers } },
        { status },
      );
    }

    return Response.json({ status: result.status });
  } catch (error) {
    return apiErrorResponse(error, "テナント審査に失敗しました");
  }
}
