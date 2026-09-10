import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit/log";
import { apiErrorResponse } from "@/lib/http/errors";
import { requireTenantMember } from "@/lib/auth/guard";
import { storeSchema } from "@/lib/validation/tenant";

/**
 * 店舗ページの作成・更新（docs/00 5.2）。
 * 0004 の stores_tenant_write と 0008 の stores_tenant_insert が効くため、
 * ここでは anon クライアントで書く。service_role は使わない。
 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== "string") {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const parsed = storeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const context = await requireTenantMember(body.tenantId);

    const { error } = await context.client.from("stores").upsert(
      {
        tenant_id: body.tenantId,
        slug: parsed.data.slug,
        display_name: parsed.data.displayName,
        description: parsed.data.description ?? null,
        is_public: parsed.data.isPublic,
      },
      { onConflict: "tenant_id" },
    );

    if (error) {
      // 23505 = slug の重複
      const status = error.code === "23505" ? 409 : 500;
      return Response.json(
        { error: { reason: status === 409 ? "slug_taken" : "internal" } },
        { status },
      );
    }

    await recordAudit({
      actorId: context.user.id,
      actorRole: "tenant_member",
      action: "store.update",
      targetTable: "stores",
      targetId: body.tenantId,
      detail: { slug: parsed.data.slug, is_public: parsed.data.isPublic },
      ip: request.headers.get("x-forwarded-for"),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "店舗情報の保存に失敗しました");
  }
}
