"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { Markdown } from "@/components/ui/markdown";
import { readApiError } from "@/lib/http/error-message";

/**
 * サイト共通ページの編集。
 *
 * 保存すると必ず新しい版が積まれる。上書き保存にしないのは、規約や
 * ポリシーは「いつ何を掲示していたか」を後から示せる必要があるため。
 *
 * 書き方の説明を画面に置いてある。本部の担当者が Markdown を知っている
 * 前提を置かない。
 */

type Props = {
  /** 新規作成なら undefined */
  pageId?: string;
  initial: {
    slug: string;
    title: string;
    sortOrder: number;
    body: string;
  };
  isPublished: boolean;
};

const SYNTAX_HINT = [
  "## 見出し / ### 小見出し",
  "空行で段落を分ける",
  "- で箇条書き、1. で番号付き",
  "**強調したい文字**",
  "[表示する文字](https://例)",
  "--- で区切り線",
];

export function SitePageForm({ pageId, initial, isPublished }: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initial.body);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * 押されたのがどちらの保存ボタンかを持つ。
   *
   * state ではなく ref にしている。click と submit は別のイベントで、
   * React は同じタスク内の更新をまとめるため、click で setState しても
   * 続く submit の中ではまだ古い値が見える。ref は即座に変わる。
   */
  const publishIntent = useRef(false);

  async function save(event: React.FormEvent<HTMLFormElement>, publish: boolean) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      slug: String(form.get("slug") ?? ""),
      title: String(form.get("title") ?? ""),
      sortOrder: Number(form.get("sortOrder") ?? 0),
      body,
      note: String(form.get("note") ?? ""),
      publish,
    };

    const response = await fetch(
      pageId ? `/admin/api/pages/${pageId}` : "/admin/api/pages",
      {
        method: pageId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "保存できませんでした"));
      return;
    }

    if (!pageId) {
      const created = (await response.json()) as { id: string };
      router.push(`/admin/pages/${created.id}`);
      return;
    }

    setSaved(publish ? "保存して公開しました。" : "下書きとして保存しました。");
    router.refresh();
  }

  async function unpublish() {
    setError(null);
    setSaved(null);
    setBusy(true);

    const response = await fetch(`/admin/api/pages/${pageId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "取り下げできませんでした"));
      return;
    }

    setSaved("公開を取り下げました。本文は残っています。");
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => save(event, publishIntent.current)}
      className="flex flex-col gap-5"
    >
      <Field label="ページ名" required hint="画面の見出しとフッターのリンクに使います">
        <TextInput name="title" defaultValue={initial.title} required maxLength={80} />
      </Field>

      <Field
        label="URL"
        required
        hint="/legal/<この値> で公開されます。英小文字・数字・ハイフン"
      >
        <TextInput
          name="slug"
          defaultValue={initial.slug}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          minLength={2}
          maxLength={60}
          className="font-mono"
        />
      </Field>

      <Field label="並び順" hint="フッターで小さい値から順に並びます">
        <TextInput
          name="sortOrder"
          type="number"
          defaultValue={initial.sortOrder}
          min={0}
          max={9999}
          inputMode="numeric"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            本文<span className="font-normal text-muted">（必須）</span>
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPreview((value) => !value)}
            className="px-3 py-1.5 text-xs"
          >
            {preview ? "編集に戻る" : "表示を確認"}
          </Button>
        </div>

        {preview ? (
          <div className="rounded-md border border-line bg-raised p-4">
            {body.trim() ? (
              <Markdown source={body} />
            ) : (
              <p className="text-sm text-subtle">本文がまだありません。</p>
            )}
          </div>
        ) : (
          <>
            <TextArea
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={18}
              required
              maxLength={60000}
              className="font-mono text-sm"
            />
            <ul className="flex flex-col gap-1 text-xs leading-5 text-subtle">
              {SYNTAX_HINT.map((line) => (
                <li key={line} className="font-mono">
                  {line}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Field label="改定メモ" hint="何を変えたかの記録。社内用で、公開ページには出ません">
        <TextInput name="note" maxLength={200} placeholder="例：連絡先を変更" />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            publishIntent.current = false;
          }}
        >
          下書きとして保存
        </Button>
        <Button
          type="submit"
          disabled={busy}
          onClick={() => {
            publishIntent.current = true;
          }}
        >
          {isPublished ? "保存して公開を更新" : "保存して公開する"}
        </Button>
        {pageId && isPublished ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={unpublish}>
            公開を取り下げる
          </Button>
        ) : null}
      </div>
    </form>
  );
}
