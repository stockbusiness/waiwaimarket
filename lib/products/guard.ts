import "server-only";

import { forbidden } from "@/lib/auth/errors";
import { requireTenantUser, type TenantContext } from "@/lib/auth/guard";
import { canActAsTenantMember } from "@/lib/auth/roles";

import { getProduct, type ProductDetail } from "./manage";

/**
 * 商品を触る前の共通の確認。
 *
 * 商品がどのテナントのものかは読んでみるまで分からないので、まず
 * テナント利用者として読み、そのうえで所属を確かめる。RLS
 * （products_tenant_read）だけでも他テナントの商品は見えないが、
 * API 側でも判定する（docs/00 8.2「RLS だけに依存しない」）。
 *
 * 見つからない場合と権限が無い場合を呼び出し側で区別できるよう、
 * 前者は null を返し、後者は AuthorizationError を投げる。
 */
export async function loadOwnProduct(
  productId: string,
): Promise<{ context: TenantContext; product: ProductDetail } | null> {
  const context = await requireTenantUser();
  const product = await getProduct(context.client, productId);
  if (!product) return null;

  if (!canActAsTenantMember(context.memberships, product.tenantId)) {
    throw forbidden("このテナントを操作する権限がありません");
  }

  return { context, product };
}
