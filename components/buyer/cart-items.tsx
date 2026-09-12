"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MAX_ITEM_QUANTITY } from "@/lib/cart/limits";
import { formatYen } from "@/lib/orders/money";
import { readApiError } from "@/lib/http/error-message";

/**
 * カートの行。数量変更と削除。
 *
 * 金額はサーバーが計算したものを表示するだけにする。画面で足し直すと、
 * サーバーの計算とずれたときに気づけない。数量を変えたら再読み込みして
 * サーバーの金額を取り直す。
 */

export type CartLineView = {
  itemId: string;
  productId: string;
  productTitle: string;
  optionLabel: string | null;
  imageUrl: string | null;
  unitPriceInclTax: number;
  quantity: number;
  availableQuantity: number;
  exceedsStock: boolean;
  unavailable: boolean;
};

export function CartItems({ lines }: { lines: CartLineView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function change(itemId: string, quantity: number) {
    setError(null);
    setBusyId(itemId);

    const response = await fetch(`/api/market/cart/items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity }),
    });

    setBusyId(null);
    if (!response.ok) {
      setError(await readApiError(response, "数量を変更できませんでした"));
      return;
    }
    router.refresh();
  }

  async function remove(itemId: string) {
    setError(null);
    setBusyId(itemId);

    const response = await fetch(`/api/market/cart/items/${itemId}`, {
      method: "DELETE",
    });

    setBusyId(null);
    if (!response.ok) {
      setError(await readApiError(response, "削除できませんでした"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li
            key={line.itemId}
            className="flex gap-3 rounded-xl border border-line bg-raised p-3"
          >
            <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface">
              {line.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={line.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
              {line.unavailable ? (
                <span className="font-medium">{line.productTitle}</span>
              ) : (
                <Link
                  href={`/products/${line.productId}`}
                  className="rounded-sm font-medium hover:text-accent"
                >
                  {line.productTitle}
                </Link>
              )}

              {line.optionLabel ? (
                <span className="text-xs text-muted">{line.optionLabel}</span>
              ) : null}

              {line.unavailable ? (
                <span className="text-xs font-bold text-danger">
                  この商品は購入できなくなりました。削除してください。
                </span>
              ) : (
                <>
                  <span className="font-bold">{formatYen(line.unitPriceInclTax)}</span>
                  {line.exceedsStock ? (
                    <span className="text-xs font-bold text-danger">
                      在庫は {line.availableQuantity} 点です。数量を減らしてください。
                    </span>
                  ) : null}
                </>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {line.unavailable ? null : (
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted">数量</span>
                    <select
                      value={line.quantity}
                      onChange={(event) => change(line.itemId, Number(event.target.value))}
                      disabled={busyId === line.itemId}
                      className="rounded-md border border-line-strong bg-raised px-2 py-1.5 text-base"
                      aria-label={`${line.productTitle} の数量`}
                    >
                      {quantityOptions(line.quantity).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => remove(line.itemId)}
                  disabled={busyId === line.itemId}
                  className="px-3 py-1.5 text-xs"
                >
                  削除
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 数量の選択肢。
 *
 * いま入っている数が上限を超えていても選べるようにする（在庫が減って
 * 超過になった場合など）。選べないと、減らすこともできなくなる。
 */
function quantityOptions(current: number): number[] {
  const max = Math.max(10, Math.min(MAX_ITEM_QUANTITY, current));
  return Array.from({ length: max }, (_, index) => index + 1);
}
