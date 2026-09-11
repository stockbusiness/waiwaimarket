"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";

type Field = { name: string; label: string; required?: boolean; type?: string; hint?: string; multiline?: boolean };

const FIELDS: Field[] = [
  { name: "legalName", label: "登記上の名称", required: true },
  { name: "representativeName", label: "代表者名", required: true },
  { name: "address", label: "所在地", required: true },
  { name: "phone", label: "電話番号", required: true, type: "tel" },
  { name: "email", label: "連絡先メールアドレス", required: true, type: "email" },
  {
    name: "invoiceRegistrationNumber",
    label: "適格請求書発行事業者の登録番号",
    hint: "T から始まる 14 桁。未取得の場合は空欄",
  },
  { name: "returnPolicy", label: "返品条件", multiline: true },
];

export function LegalProfileForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Record<string, string>;
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
    const payload: Record<string, string> = { tenantId };
    for (const field of FIELDS) payload[field.name] = String(form.get(field.name) ?? "");

    const response = await fetch(audienceApiPath("tenant", "legal-profile"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
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
      {FIELDS.map((field) => (
        <Field
          key={field.name}
          label={field.label}
          required={field.required}
          hint={field.hint}
        >
          {field.multiline ? (
            <TextArea
              name={field.name}
              defaultValue={initial[field.name] ?? ""}
              rows={4}
            />
          ) : (
            <TextInput
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={initial[field.name] ?? ""}
              required={field.required}
            />
          )}
        </Field>
      ))}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">保存しました。</Alert> : null}

      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? "保存中…" : "保存する"}
      </Button>
    </form>
  );
}
