import type { NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/http/errors";
import { loadOwnProduct } from "@/lib/products/guard";
import { deleteImage } from "@/lib/products/manage";

/**
 * 画像の削除。行を消してから Storage の実体を消す。
 *
 * 順番が逆だと、実体が消えたのに行が残る＝画像が壊れた商品になる。
 * この順なら、失敗しても Storage に孤児が残るだけで表示は正しい。
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/tenant/api/products/[id]/images/[imageId]">,
) {
  try {
    const { id, imageId } = await context.params;
    const loaded = await loadOwnProduct(id);
    if (!loaded) {
      return Response.json({ error: { reason: "not_found" } }, { status: 404 });
    }

    const result = await deleteImage(loaded.context.client, { productId: id, imageId });
    if (!result.ok) {
      return Response.json({ error: { reason: result.reason } }, { status: 404 });
    }

    if (result.storagePath) {
      const { error } = await loaded.context.client.storage
        .from("product-images")
        .remove([result.storagePath]);
      // 実体が消せなくても行は消えている。表示は正しいので失敗にしない
      if (error) console.error("画像の実体を削除できませんでした", error);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "画像の削除に失敗しました");
  }
}
