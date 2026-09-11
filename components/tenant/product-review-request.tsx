"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";
import type { ProductStatus } from "@/lib/supabase/database.types";

/**
 * 審査への提出と取り下げ。
 *
 * 承認・差戻しはここから行えない。テナントのセッションで status を
 * approved にすると 0010 のトリガが例外で拒否する。
 */
export function ProductReviewRequest({
  productId,
  status,
  blockers,
}: {
  productId: string;
  status: ProductStatus;
  /** 審査に出せない理由。空なら出せる */
  blockers: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = status === "draft" || status === "rejected";
  const canWithdraw = status === "submitted";

  async function act(action: "submit" | "withdraw") {
    setError(null);
    setBusy(true);

    // 提出が POST、取り下げが DELETE（docs/04 9.2 の /submit）
    const response = await fetch(`/tenant/api/products/${productId}/submit`, {
      method: action === "submit" ? "POST" : "DELETE",
    });

    setBusy(false);

    if (!response.ok) {
      const body = (await response.clone().json().catch(() => null)) as {
        error?: { reason?: string; blockers?: string[] };
      } | null;
      if (body?.error?.reason === "blocked" && body.error.blockers) {
        setError(body.error.blockers.join(" / "));
        return;
      }
      setError(await readApiError(response, "変更できませんでした"));
      return;
    }

    router.refresh();
  }

  if (!canSubmit && !canWithdraw) return null;

  return (
    <div className="flex flex-col gap-3">
      {canSubmit && blockers.length > 0 ? (
        <Alert tone="warning">
          審査に出す前に次を済ませてください：{blockers.join(" / ")}
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        {canSubmit ? (
          <Button
            type="button"
            onClick={() => act("submit")}
            disabled={busy || blockers.length > 0}
          >
            {busy ? "送信中…" : "審査に出す"}
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => act("withdraw")}
            disabled={busy}
          >
            審査を取り下げる
          </Button>
        ) : null}
      </div>
    </div>
  );
}
