"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";
import type { InquiryStatus } from "@/lib/inquiries/status";
import { canCloseInquiry, canReopenInquiry } from "@/lib/inquiries/status";

/**
 * 問い合わせを完了にする・再開する（0014）。
 *
 * 出すかどうかの判定は `lib/inquiries/status.ts` の純粋関数を使う。
 * API も同じものを通すので、画面に出ないのに通る、という穴ができない。
 */
export function InquiryActions({
  inquiryId,
  status,
}: {
  inquiryId: string;
  status: InquiryStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "close" | "reopen") {
    setError(null);
    setBusy(true);

    const response = await fetch(`/tenant/api/inquiries/${inquiryId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "状態を変更できませんでした"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        {canCloseInquiry(status) ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => act("close")}
            disabled={busy}
          >
            完了にする
          </Button>
        ) : null}
        {canReopenInquiry(status) ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => act("reopen")}
            disabled={busy}
          >
            再開する
          </Button>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-subtle">
        完了にすると、双方とも書き込めなくなります。取り違えたときは再開できます。
      </p>
    </div>
  );
}
