import type { NextRequest } from "next/server";

import { requireBuyer } from "@/lib/auth/guard";
import { apiErrorResponse } from "@/lib/http/errors";
import { createInquiry } from "@/lib/inquiries/store";
import { inquiryCreateSchema } from "@/lib/validation/inquiry";

/**
 * 商品への問い合わせを立てる（docs/04 9.1）。
 *
 * 経路が `/api/...` なのは、購入者面の cookie の path が `/` のため
 * （docs/04 9.0）。
 *
 * 受け取るのは商品IDと本文だけ。宛先のテナントは商品から引き直す
 * （カート投入で SKU からテナントを引くのと同じ理由。クライアントに
 * 渡させると、任意のテナント宛てにスレッドを作れる）。
 *
 * **ログイン必須。** 匿名で受けると、同じ人からの続きの質問かどうかが
 * 分からず、返事の届け先も無い。
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireBuyer();

    const parsed = inquiryCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: { reason: "invalid_input", issues: parsed.error.issues } },
        { status: 422 },
      );
    }

    const result = await createInquiry(context.client, {
      productId: parsed.data.productId,
      body: parsed.data.body,
    });

    if (!result.ok) {
      // 公開されていない商品は RLS で読めず not_found になる。
      // 「存在するが問い合わせ不可」と区別しない（存在を知らせない）
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "問い合わせを送信できませんでした");
  }
}
