import type { NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnProduct } from "@/lib/products/guard";
import { registerImage } from "@/lib/products/manage";

/**
 * Storage へ上げ終わった画像を商品に結びつける。
 *
 * 実体のアップロードはブラウザから直接 Storage へ行う（0008 のポリシーが
 * 効く）。サーバーを経由させるとファイルが 2 回転送されるうえ、
 * Route Handler の本文サイズの制限を受ける。
 *
 * ここで確かめるのはパス。0008 のポリシーは先頭フォルダが自テナントで
 * あることしか見ないため、別の商品のフォルダを指す行を作れてしまう。
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]/images">,
) {
  try {
    const { id } = await context.params;
    const loaded = await loadOwnProduct(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    if (loaded.product.images.length >= 10) {
      return Response.json({ error: { reason: "too_many_images" } }, { status: 409 });
    }

    const body = (await request.json()) as { storagePath?: unknown };
    if (typeof body.storagePath !== "string" || body.storagePath.length > 300) {
      return Response.json({ error: { reason: "invalid_input" } }, { status: 422 });
    }

    const result = await registerImage(loaded.context.client, {
      productId: id,
      tenantId: loaded.product.tenantId,
      storagePath: body.storagePath,
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return Response.json({ error: { reason: result.reason } }, { status });
    }

    return Response.json({ id: result.id });
  } catch (error) {
    return apiErrorResponse(error, "画像の登録に失敗しました");
  }
}
