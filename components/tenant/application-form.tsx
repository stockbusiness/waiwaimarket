"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
        <label key={field.name} className="flex flex-col gap-1 text-sm">
          <span>
            {field.label}
            {field.required ? <span aria-hidden> *</span> : null}
          </span>
          {field.multiline ? (
            <textarea
              name={field.name}
              rows={4}
              className="rounded border border-zinc-300 px-3 py-2 text-base"
            />
          ) : (
            <input
              name={field.name}
              type={field.type ?? "text"}
              required={field.required}
              className="rounded border border-zinc-300 px-3 py-2 text-base"
            />
          )}
          {field.hint ? <span className="text-xs text-zinc-500">{field.hint}</span> : null}
        </label>
      ))}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "送信中…" : "出店を申請する"}
      </button>
    </form>
  );
}
