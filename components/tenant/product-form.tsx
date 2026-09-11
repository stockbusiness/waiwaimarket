"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";

/**
 * 商品本体（表題・説明・カテゴリー）の入力。
 *
 * 新規作成のときは本体だけを保存し、SKU と画像は作成後の編集画面で足す。
 * 画像の置き場所が `<tenant_id>/<product_id>/...`（0008）なので、
 * 商品 ID が決まる前にはアップロードできない。
 */

export type CategoryOption = { id: string; label: string };

type Props = {
  /** 新規作成なら undefined */
  productId?: string;
  tenantId: string;
  categories: CategoryOption[];
  initial: { title: string; description: string; categoryId: string | null };
  /** 公開中の商品を直すと審査待ちへ戻る旨を出すか */
  warnsReReview: boolean;
};

const SELECT =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body";

export function ProductForm({
  productId,
  tenantId,
  categories,
  initial,
  warnsReReview,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const categoryId = String(form.get("categoryId") ?? "");
    const payload = {
      tenantId,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      categoryId: categoryId === "" ? null : categoryId,
    };

    const response = await fetch(
      productId ? `/tenant/api/products/${productId}` : "/tenant/api/products",
      {
        method: productId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "保存できませんでした"));
      return;
    }

    if (!productId) {
      const created = (await response.json()) as { id: string };
      router.push(`/tenant/products/${created.id}`);
      return;
    }

    const result = (await response.json()) as { resetToReview: boolean };
    setSaved(
      result.resetToReview
        ? "保存しました。内容が変わったため、もう一度審査に回りました。"
        : "保存しました。",
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="商品名" required>
        <TextInput name="title" defaultValue={initial.title} required maxLength={120} />
      </Field>

      <Field label="説明">
        <TextArea
          name="description"
          defaultValue={initial.description}
          rows={8}
          maxLength={5000}
        />
      </Field>

      <Field
        label="カテゴリー"
        hint={
          categories.length === 0
            ? "カテゴリーがまだ登録されていません。本部にご連絡ください。"
            : "審査に出すには選択が必要です。"
        }
      >
        <select
          name="categoryId"
          defaultValue={initial.categoryId ?? ""}
          className={SELECT}
        >
          <option value="">選択しない</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>

      {warnsReReview ? (
        <Alert tone="warning">
          公開中の商品です。商品名・説明・カテゴリーを変更すると、もう一度審査に回ります。
          価格と在庫の変更では審査に戻りません。
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved}</Alert> : null}

      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? "保存中…" : productId ? "保存する" : "作成して次へ"}
      </Button>
    </form>
  );
}
