import type { Json } from "@/lib/supabase/database.types";

/**
 * 監査ログの行の組み立て。
 * IO を持たないのでテストしやすい。実際の書き込みは lib/audit/log.ts。
 */

export type AuditEntry = {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  detail?: Record<string, Json>;
  ip?: string | null;
};

export type AuditRow = {
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: Json;
  ip: string | null;
};

export function buildAuditRow(entry: AuditEntry): AuditRow {
  const action = entry.action.trim();
  if (!action) {
    throw new Error("監査ログの action は必須です");
  }

  return {
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    detail: (entry.detail ?? {}) as Json,
    ip: normalizeIp(entry.ip),
  };
}

/**
 * X-Forwarded-For は "client, proxy1, proxy2" の形で届く。先頭だけを採る。
 * inet 型に入らない値は捨てる（監査ログの記録自体を失敗させない）。
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  return isIpAddress(first) ? first : null;
}

function isIpAddress(value: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(value)) {
    return value.split(".").every((part) => Number(part) <= 255);
  }
  // IPv6 は簡易判定にとどめる
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}
