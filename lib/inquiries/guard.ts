import "server-only";

import { forbidden } from "@/lib/auth/errors";
import { requireTenantUser, type TenantContext } from "@/lib/auth/guard";
import { canActAsTenantMember } from "@/lib/auth/roles";

import { getInquiry, type InquiryDetail } from "./store";

/**
 * テナントが問い合わせを触る前の共通の確認（lib/products/guard.ts と同じ形）。
 *
 * どのテナント宛てかは読んでみるまで分からないので、まずテナント利用者として
 * 読み、そのうえで所属を確かめる。RLS（0014 の `inquiries_tenant_read`）
 * だけでも他店宛ては見えないが、API 側でも判定する
 * （docs/00 8.2「RLS だけに依存しない」）。
 *
 * 見つからない場合と権限が無い場合を呼び出し側で区別できるよう、
 * 前者は null を返し、後者は AuthorizationError を投げる。
 */
export async function loadOwnInquiry(
  inquiryId: string,
): Promise<{ context: TenantContext; inquiry: InquiryDetail } | null> {
  const context = await requireTenantUser();
  const inquiry = await getInquiry(context.client, inquiryId);
  if (!inquiry) return null;

  if (!canActAsTenantMember(context.memberships, inquiry.tenantId)) {
    throw forbidden("このテナントを操作する権限がありません");
  }

  return { context, inquiry };
}
