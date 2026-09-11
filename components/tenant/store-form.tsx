"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";

type Props = {
  tenantId: string;
  initial: {
    slug: string;
    displayName: string;
    description: string;
    isPublic: boolean;
  };
};

export function StoreForm({ tenantId, initial }: Props) {
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
    const response = await fetch(audienceApiPath("tenant", "store"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        slug: String(form.get("slug") ?? ""),
        displayName: String(form.get("displayName") ?? ""),
        description: String(form.get("description") ?? ""),
        isPublic: form.get("isPublic") === "on",
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
      <Field
        label="店舗 URL"
        required
        hint="/stores/&lt;この値&gt; で公開されます。英小文字・数字・ハイフン、3〜40 文字"
      >
        <TextInput
          name="slug"
          defaultValue={initial.slug}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          minLength={3}
          maxLength={40}
          className="font-mono"
        />
      </Field>

      <Field label="店舗名" required>
        <TextInput
          name="displayName"
          defaultValue={initial.displayName}
          required
          maxLength={60}
        />
      </Field>

      <Field label="紹介文">
        <TextArea
          name="description"
          defaultValue={initial.description}
          rows={6}
          maxLength={2000}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={initial.isPublic}
            className="size-4"
          />
          店舗ページを公開する
        </label>
        <p className="text-xs leading-5 text-subtle">
          公開してもテナントが承認されるまでは表に出ません。
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">保存しました。</Alert> : null}

      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? "保存中…" : "保存する"}
      </Button>
    </form>
  );
}
