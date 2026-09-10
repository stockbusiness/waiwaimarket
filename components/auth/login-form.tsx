"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
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
      <Alert tone="success">
        <strong>{email}</strong> 宛に確認メールを送りました。
        メール内のリンクを開くとログインが完了します。
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="メールアドレス" required>
        <TextInput
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "送信中…" : "確認メールを送る"}
      </Button>
    </form>
  );
}
