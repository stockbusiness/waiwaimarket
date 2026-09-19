import type { NextRequest } from "next/server";

import { createAddress } from "@/lib/addresses/store";
import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { addressSchema } from "@/lib/validation/address";

/**
 * 配送先の登録（docs/04 9.1）。
 *
 * 経路が `/api/...` なのは、購入者面の cookie の path が `/` のため
 * （docs/04 9.0）。
 *
 * 購入者IDはセッションから取る。body から受け取らない。
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireBuyer();

    const parsed = addressSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const { id } = await createAddress(context.client, context.user.id, parsed.data);
    return Response.json({ id });
  } catch (error) {
    return apiErrorResponse(error, "配送先を登録できませんでした");
  }
}
