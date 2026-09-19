"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AddressView } from "@/components/buyer/address-list";
import { formatAddress } from "@/lib/addresses/address";
import { readApiError } from "@/lib/http/error-message";
import { formatRemaining } from "@/lib/inventory/ttl";
import { formatYen } from "@/lib/orders/money";

/**
 * 購入手続きの開始（docs/06 4.2）。
 *
 * 届け先を選んで「進む」と、サーバーが在庫を引き当てて送料を確定する。
 * カートでは地域別送料の下限を「800円〜」と出しているだけで、金額はここで
 * 決まる。
 *
 * **金額は必ずサーバーの返り値を出す。** 画面で足し直さない。
 */

type Preview = {
  amounts: {
    subtotalInclTax: number;
    shippingFee: number;
    pointDiscount: number;
    totalCharged: number;
    taxes: Array<{ rate: number; tax: number }>;
  };
  shippingAddress: { recipientName: string };
  expiresAt: string | null;
};

export function CheckoutStart({
  cartId,
  addresses,
}: {
  cartId: string;
  addresses: AddressView[];
}) {
  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    setPreview(null);
    setBusy(true);

    const response = await fetch("/api/market/checkout/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cartId, addressId }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "購入手続きを開始できませんでした"));
      return;
    }

    const body = (await response.json()) as { preview: Preview };
    setPreview(body.preview);
  }

  if (addresses.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted">お届け先が登録されていません。</p>
        <Link
          href="/addresses"
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent"
        >
          配送先を登録する
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">お届け先</legend>
        {addresses.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-3 rounded-xl border border-line bg-raised p-3 text-sm"
          >
            <input
              type="radio"
              name="addressId"
              value={address.id}
              checked={addressId === address.id}
              onChange={() => {
                setAddressId(address.id);
                // 届け先が変われば送料も変わる。古い金額を残さない
                setPreview(null);
              }}
              className="mt-1 size-4 shrink-0"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{address.recipientName}</span>
              <span className="text-muted">{formatAddress(address)}</span>
            </span>
          </label>
        ))}
        <Link href="/addresses" className="w-fit rounded-sm text-sm text-link hover:underline">
          配送先を追加・編集する
        </Link>
      </fieldset>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {preview ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-4">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="小計">{formatYen(preview.amounts.subtotalInclTax)}</Row>
            <Row label="送料">
              {preview.amounts.shippingFee === 0
                ? "無料"
                : formatYen(preview.amounts.shippingFee)}
            </Row>
            {preview.amounts.taxes.map((bucket) => (
              <Row key={bucket.rate} label={`（内 消費税 ${Math.round(bucket.rate * 100)}%）`}>
                <span className="text-muted">{formatYen(bucket.tax)}</span>
              </Row>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
              <dt className="font-bold">お支払い金額</dt>
              <dd className="text-lg font-bold">{formatYen(preview.amounts.totalCharged)}</dd>
            </div>
          </dl>

          <Alert tone="success">
            在庫を確保しました
            {preview.expiresAt ? `（${formatRemaining(new Date(preview.expiresAt))}）` : ""}。
            送料はこの金額で確定です。
          </Alert>

          {/* 決済はフェーズ3 の Stripe 接続と一緒に入る。導線はまだ置かない */}
          <p className="text-sm text-muted">
            お支払いは準備中です。決済の接続が終わり次第ご利用いただけます。
          </p>
        </div>
      ) : (
        <Button type="button" onClick={start} disabled={busy || !addressId} className="w-fit">
          {busy ? "確認中…" : "この住所で送料を確定する"}
        </Button>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
