"use client";

import { useState } from "react";

import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/supabase/env";

type Props = {
  audience: Audience;
  /** ログイン後に戻る先。proxy.ts が付ける */
  next?: string;
};

/**
 * メール認証によるログイン（docs/06 4.1）。
 * パスワードは持たせず、確認リンクのみで認証する。
 */
export function LoginForm({ audience, next }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setState("sending");

    const callback = new URL(AUDIENCE_CONFIG[audience].callbackPath, siteUrl());
    if (next) callback.searchParams.set("next", next);

    const supabase = createSupabaseBrowserClient(audience);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString() },
    });

    if (signInError) {
      setError(signInError.message);
      setState("idle");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="text-sm leading-6">
        <strong>{email}</strong> 宛に確認メールを送りました。
        メール内のリンクを開くとログインが完了します。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        メールアドレス
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-base"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {state === "sending" ? "送信中…" : "確認メールを送る"}
      </button>
    </form>
  );
}
