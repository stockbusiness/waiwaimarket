"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatYen } from "@/lib/orders/money";
import { readApiError } from "@/lib/http/error-message";

/**
 * 商品詳細の「カートに入れる」。
 *
 * SKU が 1 つなら選ばせず、複数なら選んでもらう。
 * 送るのは SKU と数量だけで、金額は送らない。
 */

export type PurchasableVariant = {
  id: string;
  label: string;
  priceInclTax: number;
  inStock: boolean;
};

const SELECT =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body";

export function AddToCart({
  variants,
  loggedIn,
}: {
  variants: PurchasableVariant[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const purchasable = variants.filter((variant) => variant.inStock);

  const [variantId, setVariantId] = useState(purchasable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (purchasable.length === 0) {
    return <p className="text-sm text-muted">現在購入できる種類がありません。</p>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loggedIn) {
      // 購入にはマーケット専用の会員登録が要る（docs/06 4.1）。
      // 戻り先を渡して、ログイン後に元の商品へ戻す
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setError(null);
    setAdded(false);
    setBusy(true);

    const response = await fetch("/api/market/cart/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId, quantity }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "カートに追加できませんでした"));
      return;
    }

    setAdded(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {purchasable.length > 1 ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">種類</span>
          <select
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            className={SELECT}
          >
            {purchasable.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}（{formatYen(variant.priceInclTax)}）
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">数量</span>
        <select
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
          className={SELECT}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {added ? <Alert tone="success">カートに追加しました。</Alert> : null}

      <Button type="submit" disabled={busy} className="w-full sm:w-fit">
        {busy ? "追加中…" : loggedIn ? "カートに入れる" : "ログインして購入する"}
      </Button>

      <p className="text-xs leading-5 text-subtle">
        カートに入れた時点では在庫を確保しません。購入手続きを始めたときに
        15 分間だけ確保します。
      </p>
    </form>
  );
}
