import "server-only";

import { forbidden } from "@/lib/auth/errors";
import { requireTenantUser, type TenantContext } from "@/lib/auth/guard";
import { canActAsTenantMember } from "@/lib/auth/roles";

import { getOrder, type OrderDetail } from "./store";

/**
 * テナントが注文を触る前の共通の確認
 * （lib/products/guard.ts・lib/inquiries/guard.ts と同じ形）。
 *
 * どのテナントの注文かは読んでみるまで分からないので、まずテナント利用者
 * として読み、そのうえで所属を確かめる。RLS（0002 の
 * `orders_tenant_read`）だけでも他店の注文は見えないが、API 側でも判定する
 * （docs/00 8.2「RLS だけに依存しない」）。
 *
 * 見つからない場合と権限が無い場合を呼び出し側で区別できるよう、
 * 前者は null を返し、後者は AuthorizationError を投げる。
 */
export async function loadOwnOrder(
  orderId: string,
): Promise<{ context: TenantContext; order: OrderDetail } | null> {
  const context = await requireTenantUser();
  const order = await getOrder(context.client, orderId);
  if (!order) return null;

  if (!canActAsTenantMember(context.memberships, order.tenantId)) {
    throw forbidden("このテナントを操作する権限がありません");
  }

  return { context, order };
}
