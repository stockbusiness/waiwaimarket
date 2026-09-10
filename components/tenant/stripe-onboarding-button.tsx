"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";

export function StripeOnboardingButton({
  tenantId,
  hasAccount,
}: {
  tenantId: string;
  hasAccount: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function start() {
    setError(null);
    setLoading(true);

    const response = await fetch(audienceApiPath("tenant", "onboarding/stripe"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Stripe の手続きを開始できませんでした"));
      setLoading(false);
      return;
    }

    const { url } = (await response.json()) as { url: string };
    window.location.href = url;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={start} disabled={loading} className="w-fit">
        {loading
          ? "接続中…"
          : hasAccount
            ? "Stripe の手続きを再開する"
            : "Stripe の手続きを始める"}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
