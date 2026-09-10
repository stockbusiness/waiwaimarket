"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <label className="flex flex-col gap-1 text-sm">
        店舗 URL
        <span className="text-xs text-zinc-500">
          /stores/&lt;この値&gt; で公開されます。英小文字・数字・ハイフン、3〜40 文字
        </span>
        <input
          name="slug"
          defaultValue={initial.slug}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          minLength={3}
          maxLength={40}
          className="rounded border border-zinc-300 px-3 py-2 font-mono text-base"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        店舗名
        <input
          name="displayName"
          defaultValue={initial.displayName}
          required
          maxLength={60}
          className="rounded border border-zinc-300 px-3 py-2 text-base"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        紹介文
        <textarea
          name="description"
          defaultValue={initial.description}
          rows={6}
          maxLength={2000}
          className="rounded border border-zinc-300 px-3 py-2 text-base"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} />
        店舗ページを公開する
      </label>
      <p className="text-xs text-zinc-500">
        公開してもテナントが承認されるまでは表に出ません。
      </p>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-green-700">保存しました。</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
