"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";

/**
 * 送料と発送日数の設定（docs/00 5.2）。
 *
 * 地域別送料は扱わない。構造が docs で未定義のため。
 */
export function ShippingForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: {
    name: string;
    baseFee: string;
    freeThreshold: string;
    leadTimeDays: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const threshold = String(form.get("freeThreshold") ?? "").trim();

    const response = await fetch(audienceApiPath("tenant", "shipping"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        name: String(form.get("name") ?? ""),
        baseFee: String(form.get("baseFee") ?? "0"),
        // 空欄は「しきい値なし」。0 と区別する
        freeThreshold: threshold === "" ? null : threshold,
        leadTimeDays: String(form.get("leadTimeDays") ?? "3"),
      }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "保存できませんでした"));
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="名称" required hint="社内で見分けるための名前です">
        <TextInput name="name" defaultValue={initial.name} required maxLength={60} />
      </Field>

      <Field label="基本送料（円）" required>
        <TextInput
          name="baseFee"
          type="number"
          defaultValue={initial.baseFee}
          min={0}
          max={100000}
          step={1}
          required
          inputMode="numeric"
        />
      </Field>

      <Field
        label="送料無料になる金額（円）"
        hint="空欄なら常に基本送料がかかります。入力した金額ちょうどでも無料になります"
      >
        <TextInput
          name="freeThreshold"
          type="number"
          defaultValue={initial.freeThreshold}
          min={1}
          max={1000000}
          step={1}
          inputMode="numeric"
        />
      </Field>

      <Field label="発送までの目安（日）" required hint="商品ページと購入手続きに表示されます">
        <TextInput
          name="leadTimeDays"
          type="number"
          defaultValue={initial.leadTimeDays}
          min={0}
          max={60}
          step={1}
          required
          inputMode="numeric"
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">保存しました。</Alert> : null}

      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? "保存中…" : "保存する"}
      </Button>

      <p className="text-xs leading-5 text-subtle">
        地域別の送料はまだ設定できません。必要な場合は本部にご相談ください。
      </p>
    </form>
  );
}
