import type { NextRequest } from "next/server";

import { deleteAddress, updateAddress } from "@/lib/addresses/store";
import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { addressSchema } from "@/lib/validation/address";

/**
 * 配送先の更新・削除（docs/04 9.1）。
 *
 * 他人の住所は RLS（0013 の `buyer_addresses_self_all`）が弾く。
 * 0 件更新・0 件削除なら `not_found` を返す。「他人のものだから拒否した」と
 * 区別できる応答にすると、存在するかどうかを外から確かめられてしまう。
 *
 * Next.js 16 では `params` が Promise（CLAUDE.md）。
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireBuyer();
    const { id } = await params;

    const parsed = addressSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await updateAddress(context.client, context.user.id, id, parsed.data);
    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "配送先を保存できませんでした");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBuyer();
    const { id } = await params;

    const result = await deleteAddress(context.client, id);
    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "配送先を削除できませんでした");
  }
}
