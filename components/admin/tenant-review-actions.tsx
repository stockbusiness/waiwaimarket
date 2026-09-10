"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readApiError } from "@/lib/http/error-message";

import type { TenantReviewAction } from "@/lib/tenants/status";

const LABELS: Record<TenantReviewAction, string> = {
  start_review: "審査を開始する",
  approve: "承認する",
  reject: "差し戻す",
  suspend: "停止する",
  reinstate: "停止を解除する",
};

export function TenantReviewActions({
  tenantId,
  actions,
}: {
  tenantId: string;
  actions: TenantReviewAction[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<TenantReviewAction | null>(null);

  async function run(action: TenantReviewAction) {
    setError(null);
    setPending(action);

    const reason =
      action === "reject" || action === "suspend"
        ? (window.prompt("理由を入力してください（監査ログに残ります）") ?? "")
        : undefined;

    const response = await fetch(`/api/admin/tenants/${tenantId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason: reason || undefined }),
    });

    if (!response.ok) {
      // 承認できない理由が返っていればそれを優先する
      const cloned = response.clone();
      const body = (await cloned.json().catch(() => null)) as
        | { error?: { blockers?: string[] } }
        | null;
      setError(
        body?.error?.blockers?.join(" / ") ??
          (await readApiError(response, "操作できませんでした")),
      );
      setPending(null);
      return;
    }

    setPending(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => run(action)}
            disabled={pending !== null}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {LABELS[action]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
