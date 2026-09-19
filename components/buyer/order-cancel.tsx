"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";
import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * 購入者からの取消（0015）。
 *
 * **決済前（`pending`）はその場で取り消し、決済後（`paid`）は申請**になる。
 * 押す前にどちらか分かるよう、文言を状態で変える。押してから
 * 「申請を受け付けました」と出るのでは、取り消せたのかどうか分からない。
 */
export function OrderCancel({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const immediate = status === "pending";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setBusy(true);

    const response = await fetch(`/api/market/orders/${orderId}/cancel-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: String(form.get("note") ?? "") }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "受け付けられませんでした"));
      return;
    }

    const body = (await response.json()) as { cancelled: boolean };
    if (body.cancelled) {
      router.refresh();
      return;
    }
    setDone("取消のご希望を販売者へお伝えしました。折り返しご連絡します。");
  }

  if (done) return <Alert tone="success">{done}</Alert>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">
          理由<span className="font-normal text-muted">（任意）</span>
        </span>
        <textarea
          name="note"
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body"
        />
      </label>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" variant="secondary" disabled={busy} className="w-fit">
        {busy ? "送信中…" : immediate ? "注文を取り消す" : "取消を申し込む"}
      </Button>

      <p className="text-xs leading-5 text-subtle">
        {immediate
          ? "お支払い前のため、その場で取り消されます。"
          : "発送の準備が始まっている場合があります。販売者が確認のうえご連絡します。"}
      </p>
    </form>
  );
}
