"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";

import { audienceApiPath } from "@/lib/supabase/audience";
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

    const response = await fetch(audienceApiPath("hq", `tenants/${tenantId}/review`), {
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
          <Button
            key={action}
            type="button"
            variant={action === "approve" ? "primary" : "secondary"}
            onClick={() => run(action)}
            disabled={pending !== null}
          >
            {pending === action ? "実行中…" : LABELS[action]}
          </Button>
        ))}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
