"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { MAX_MESSAGE_LENGTH } from "@/lib/inquiries/status";

/**
 * 商品詳細の「問い合わせる」（0014）。
 *
 * 価格が決まっていない、または価格を公開できない商品では、カートの
 * 代わりにこれが出る。送るのは商品IDと本文だけで、宛先のテナントは
 * サーバーが商品から引き直す。
 */
export function InquiryStart({
  productId,
  loggedIn,
}: {
  productId: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loggedIn) {
      // 返事の届け先が要るのでログイン必須。戻り先を渡して元の商品へ返す
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy(true);

    const response = await fetch("/api/market/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, body: String(form.get("body") ?? "") }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "送信できませんでした"));
      return;
    }

    const created = (await response.json()) as { id: string };
    router.push(`/inquiries/${created.id}`);
  }

  if (!loggedIn) {
    // 未ログインでも押せるようにして、押したところでログインへ送る。
    // 先に「ログインしてください」とだけ出すと、何ができる画面なのかが
    // 分からないまま離脱する（カートのボタンと同じ扱い）
    return (
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Button type="submit" className="w-full sm:w-fit">
          ログインして問い合わせる
        </Button>
        <p className="text-xs leading-5 text-subtle">
          お返事をお届けするため、お問い合わせには会員登録が必要です。
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="お問い合わせ内容"
        required
        hint={`${MAX_MESSAGE_LENGTH}文字まで。お店から直接お返事します。`}
      >
        <TextArea
          name="body"
          rows={5}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="ご希望の数量や納期など、お知りになりたいことをご記入ください。"
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={busy} className="w-full sm:w-fit">
        {busy ? "送信中…" : "問い合わせる"}
      </Button>

      <p className="text-xs leading-5 text-subtle">
        お返事は「お問い合わせ」の画面に届きます。メールでのお知らせはまだ行っていません。
      </p>
    </form>
  );
}
