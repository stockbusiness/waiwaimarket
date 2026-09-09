import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { buildAuditRow, type AuditEntry } from "./entry";

export type { AuditEntry, AuditRow } from "./entry";
export { buildAuditRow, normalizeIp } from "./entry";

/**
 * 監査ログ（docs/00 5.3、docs/05「管理者操作が監査ログに記録される」）。
 *
 * audit_logs には INSERT ポリシーを置いていないため、書き込みは service_role
 * 経由に限られる。読み取りは本部オペレーター以上（0002 の hq_read_audit）。
 *
 * 記録の失敗で本処理を巻き込まないよう、例外は投げずに握りつぶす。
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const row = buildAuditRow(entry);
    const service = createSupabaseServiceClient();
    const { error } = await service.from("audit_logs").insert(row);
    if (error) {
      console.error("監査ログの記録に失敗しました", { action: row.action, error });
    }
  } catch (error) {
    console.error("監査ログの記録に失敗しました", error);
  }
}
