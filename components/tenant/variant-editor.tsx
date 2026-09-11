"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";

/**
 * SKU・価格・在庫の編集。
 *
 * 1 回の保存で全行を送る。行ごとの API にすると、途中で失敗したときに
 * 画面と DB がずれる。
 *
 * 金額は円の整数で扱う。小数で持つと、税・送料・ポイントの配分で
 * 端数が積もって合計が合わなくなる。
 */

export type VariantRow = {
  /** 未保存の行は undefined */
  id?: string;
  sku: string;
  optionLabel: string;
  priceInclTax: string;
  taxRate: 0.1 | 0.08;
  quantity: string;
  isActive: boolean;
  /** 引当中の数。表示のみ（サーバー処理だけが動かす） */
  reservedQuantity: number;
};

const SELECT =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body";

function emptyRow(): VariantRow {
  return {
    sku: "",
    optionLabel: "",
    priceInclTax: "0",
    taxRate: 0.1,
    quantity: "0",
    isActive: true,
    reservedQuantity: 0,
  };
}

export function VariantEditor({
  productId,
  initial,
}: {
  productId: string;
  initial: VariantRow[];
}) {
  const router = useRouter();
  const fieldId = useId();
  const [rows, setRows] = useState<VariantRow[]>(
    initial.length > 0 ? initial : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(index: number, patch: Partial<VariantRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function remove(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);

    const response = await fetch(`/tenant/api/products/${productId}/variants`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variants: rows.map((row) => ({
          id: row.id,
          sku: row.sku,
          optionLabel: row.optionLabel,
          priceInclTax: row.priceInclTax,
          taxRate: row.taxRate,
          quantity: row.quantity,
          isActive: row.isActive,
        })),
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
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li
            key={row.id ?? `new-${index}`}
            className="rounded-xl border border-line bg-raised p-4"
          >
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">
                  SKU<span className="font-normal text-muted">（必須）</span>
                </span>
                <TextInput
                  value={row.sku}
                  onChange={(event) => update(index, { sku: event.target.value })}
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9][A-Za-z0-9_\-]*"
                  className="font-mono"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">種類</span>
                <TextInput
                  value={row.optionLabel}
                  onChange={(event) => update(index, { optionLabel: event.target.value })}
                  maxLength={60}
                  placeholder="例：Mサイズ／白"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">
                    価格（税込・円）<span className="font-normal text-muted">（必須）</span>
                  </span>
                  <TextInput
                    value={row.priceInclTax}
                    onChange={(event) =>
                      update(index, { priceInclTax: event.target.value })
                    }
                    type="number"
                    min={0}
                    max={10000000}
                    step={1}
                    required
                    inputMode="numeric"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">税率</span>
                  <select
                    value={row.taxRate}
                    onChange={(event) =>
                      update(index, {
                        taxRate: Number(event.target.value) === 0.08 ? 0.08 : 0.1,
                      })
                    }
                    className={SELECT}
                  >
                    <option value={0.1}>標準 10%</option>
                    <option value={0.08}>軽減 8%</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">在庫数</span>
                <TextInput
                  value={row.quantity}
                  onChange={(event) => update(index, { quantity: event.target.value })}
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  inputMode="numeric"
                />
                {row.reservedQuantity > 0 ? (
                  <span className="text-xs leading-5 text-subtle">
                    うち {row.reservedQuantity} 点が購入手続き中で引当されています。
                  </span>
                ) : null}
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    id={`${fieldId}-active-${index}`}
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(event) => update(index, { isActive: event.target.checked })}
                    className="size-4"
                  />
                  販売する
                </label>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => remove(index)}
                  className="px-3 py-1.5 text-xs"
                >
                  この SKU を削除
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">SKU がありません。1 つ以上必要です。</p>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">SKU を保存しました。</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          disabled={rows.length >= 50}
        >
          SKU を追加
        </Button>
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "保存中…" : "SKU を保存"}
        </Button>
      </div>
    </div>
  );
}
