import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { requireTenantUser } from "@/lib/auth/guard";
import { submitTenantApplication } from "@/lib/tenants/application";
import { tenantApplicationSchema } from "@/lib/validation/tenant";

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantUser();

    const parsed = tenantApplicationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await submitTenantApplication({
      userId: context.user.id,
      input: parsed.data,
      ip: request.headers.get("x-forwarded-for"),
    });

    if (!result.ok) {
      const status = result.reason === "already_belongs_to_tenant" ? 409 : 500;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ tenantId: result.tenantId }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: { reason: "internal" } }, { status: 500 });
  }
}
