"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Badge } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import type { CategoryRow } from "@/lib/products/categories";

/**
 * 商品カテゴリーの管理（docs/00 5.3）。
 *
 * 削除は用意しない。商品から参照されているカテゴリーを消すと、
 * どの棚にあった商品か分からなくなる。使わなくなったものは
 * 「表示しない」にする（0006 の is_active、公開読み取りが見ている）。
 */

const SELECT =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body";

type Draft = {
  name: string;
  slug: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
};

function toDraft(row?: CategoryRow): Draft {
  return {
    name: row?.name ?? "",
    slug: row?.slug ?? "",
    parentId: row?.parentId ?? "",
    sortOrder: String(row?.sortOrder ?? 100),
    isActive: row?.isActive ?? true,
  };
}

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameById = new Map(categories.map((row) => [row.id, row.name]));

  function startNew() {
    setEditingId(null);
    setDraft(toDraft());
    setError(null);
    setSaved(null);
  }

  function startEdit(row: CategoryRow) {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setError(null);
    setSaved(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setBusy(true);

    const response = await fetch(
      editingId ? `/admin/api/categories/${editingId}` : "/admin/api/categories",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          slug: draft.slug,
          parentId: draft.parentId === "" ? null : draft.parentId,
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        }),
      },
    );

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "保存できませんでした"));
      return;
    }

    setSaved(editingId ? "保存しました。" : "追加しました。");
    startNew();
    router.refresh();
  }

  // 親に選べるのは、自分以外で親を持たないもの。3 階層以上を作らせない
  const parentOptions = categories.filter(
    (row) => row.id !== editingId && row.parentId === null,
  );

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {categories.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {row.parentId ? `${nameById.get(row.parentId) ?? "?"} › ` : ""}
                {row.name}
              </span>
              <span className="font-mono text-xs text-muted">{row.slug}</span>
              {row.isActive ? null : <Badge>表示しない</Badge>}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => startEdit(row)}
              className="px-3 py-1.5 text-xs"
            >
              編集
            </Button>
          </li>
        ))}
      </ul>

      {categories.length === 0 ? (
        <p className="text-sm text-muted">
          カテゴリーがまだありません。テナントは審査に出す前にカテゴリーを選ぶ必要があるため、
          先に登録してください。
        </p>
      ) : null}

      <form onSubmit={save} className="flex flex-col gap-4 border-t border-line pt-6">
        <h3 className="text-base font-bold">
          {editingId ? "カテゴリーを編集" : "カテゴリーを追加"}
        </h3>

        <Field label="名称" required>
          <TextInput
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            required
            maxLength={60}
          />
        </Field>

        <Field label="URL に使う名前" required hint="英小文字・数字・ハイフン">
          <TextInput
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            minLength={2}
            maxLength={60}
            className="font-mono"
          />
        </Field>

        <Field label="親カテゴリー" hint="2 階層まで。親を持つものは親に選べません">
          <select
            value={draft.parentId}
            onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
            className={SELECT}
          >
            <option value="">なし（大分類）</option>
            {parentOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="並び順" hint="小さい値から順に並びます">
          <TextInput
            value={draft.sortOrder}
            onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
            type="number"
            min={0}
            max={9999}
            inputMode="numeric"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            className="size-4"
          />
          このカテゴリーを使う
        </label>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {saved ? <Alert tone="success">{saved}</Alert> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "保存中…" : editingId ? "保存する" : "追加する"}
          </Button>
          {editingId ? (
            <Button type="button" variant="secondary" onClick={startNew}>
              編集をやめる
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
