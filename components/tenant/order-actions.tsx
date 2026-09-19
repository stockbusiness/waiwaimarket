"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { availableActions } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * 発送登録とテナント都合の取消（0015）。
 *
 * 出すかどうかの判定は `lib/orders/status.ts` の `availableActions()` を使う。
 * API も同じものを通すので、画面に出ないのに通る、という穴ができない
 * （画面の出し分けは守りではない。docs/00 8.2 と同じ考え方）。
 */
export function OrderActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const actions = availableActions(status, "tenant");
  const canShip = actions.includes("ship");
  const canCancel = actions.includes("cancel");

  async function post(path: string, body: unknown) {
    setError(null);
    setBusy(true);

    const response = await fetch(`/tenant/api/orders/${orderId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "実行できませんでした"));
      return;
    }
    router.refresh();
  }

  async function ship(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("ship", {
      carrier: String(form.get("carrier") ?? ""),
      trackingNumber: String(form.get("trackingNumber") ?? ""),
    });
  }

  async function cancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("cancel", { note: String(form.get("note") ?? "") });
  }

  if (!canShip && !canCancel) {
    return <p className="text-sm text-muted">この状態で行える操作はありません。</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canShip ? (
        <form onSubmit={ship} className="flex flex-col gap-3">
          <Field
            label="配送業者"
            hint="追跡番号が無い配送方法（ネコポス・定形外など）でも登録できます。"
          >
            <TextInput name="carrier" maxLength={60} />
          </Field>
          <Field label="追跡番号">
            <TextInput name="trackingNumber" maxLength={60} />
          </Field>
          <Button type="submit" disabled={busy} className="w-fit">
            {busy ? "登録中…" : "発送を登録する"}
          </Button>
          <p className="text-xs leading-5 text-subtle">
            発送登録日はオーリーポイントの確定日（＋14日）の起点になります。
          </p>
        </form>
      ) : null}

      {canCancel ? (
        <form onSubmit={cancel} className="flex flex-col gap-3 border-t border-line pt-6">
          <Field
            label="取消の理由"
            required
            hint="購入者にそのまま表示されます。何が起きたか分かる言葉でご記入ください。"
          >
            <TextInput name="note" required maxLength={1000} />
          </Field>
          <Button type="submit" variant="secondary" disabled={busy} className="w-fit">
            {busy ? "処理中…" : "この注文を取り消す"}
          </Button>
          <p className="text-xs leading-5 text-subtle">
            確保していた在庫は戻ります。発送後は取り消せません（返金の扱いになります）。
          </p>
        </form>
      ) : null}
    </div>
  );
}
