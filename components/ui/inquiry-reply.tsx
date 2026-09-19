"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { MAX_MESSAGE_LENGTH } from "@/lib/inquiries/status";

/**
 * 返信の入力（0014）。購入者面とテナント面で同じものを使う。
 *
 * 送り先の API だけが違う（面ごとに cookie の path が違うため、
 * 経路も `/api/...` と `/tenant/api/...` に分かれる。docs/04 9.0）。
 * 投げ先を親から渡し、中身は共通にする。
 */
export function InquiryReply({
  endpoint,
  label = "返信",
}: {
  endpoint: string;
  label?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setBusy(true);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: String(form.get("body") ?? "") }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "送信できませんでした"));
      return;
    }

    // 送った文が入力欄に残っていると、二重に送ってしまう
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
      <Field label={label} required hint={`${MAX_MESSAGE_LENGTH}文字まで。`}>
        <TextArea name="body" rows={4} required maxLength={MAX_MESSAGE_LENGTH} />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={busy} className="w-full sm:w-fit">
        {busy ? "送信中…" : "送信する"}
      </Button>
    </form>
  );
}
