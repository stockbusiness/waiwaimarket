"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";

type Field = {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  hint?: string;
  multiline?: boolean;
};

const FIELDS: Field[] = [
  { name: "name", label: "店舗表示名", required: true },
  { name: "legalName", label: "登記上の名称", required: true },
  { name: "representativeName", label: "代表者名", required: true },
  { name: "address", label: "所在地", required: true },
  { name: "phone", label: "電話番号", required: true, type: "tel" },
  { name: "email", label: "連絡先メールアドレス", required: true, type: "email" },
  {
    name: "invoiceRegistrationNumber",
    label: "適格請求書発行事業者の登録番号",
    hint: "T から始まる 14 桁。未取得の場合は空欄で構いません",
  },
  { name: "returnPolicy", label: "返品条件", multiline: true },
];

export function TenantApplicationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      FIELDS.map((field) => [field.name, String(form.get(field.name) ?? "")]),
    );

    const response = await fetch(audienceApiPath("tenant", "application"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readApiError(response, "申請を登録できませんでした"));
      setSubmitting(false);
      return;
    }

    router.push("/tenant");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {FIELDS.map((field) => (
        <Field
          key={field.name}
          label={field.label}
          required={field.required}
          hint={field.hint}
        >
          {field.multiline ? (
            <TextArea name={field.name} rows={4} />
          ) : (
            <TextInput
              name={field.name}
              type={field.type ?? "text"}
              required={field.required}
            />
          )}
        </Field>
      ))}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? "送信中…" : "出店を申請する"}
      </Button>
    </form>
  );
}
