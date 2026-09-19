"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AddressForm, EMPTY_ADDRESS, type AddressFormValues } from "./address-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatAddress, formatPostalCode, type Address } from "@/lib/addresses/address";
import { readApiError } from "@/lib/http/error-message";

/**
 * 配送先の一覧（docs/00 5.1）。
 *
 * 追加・編集・削除・既定の指定をここで行う。既定は 1 件だけで、
 * 0013 の部分一意索引が 2 件目を拒否する。
 */

export type AddressView = Address & { id: string; isDefault: boolean };

function toFormValues(address: AddressView): AddressFormValues {
  return {
    id: address.id,
    recipientName: address.recipientName,
    phone: address.phone,
    postalCode: address.postalCode,
    prefectureCode: address.prefectureCode,
    city: address.city,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? "",
    isDefault: address.isDefault,
  };
}

export function AddressList({ addresses }: { addresses: AddressView[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(addresses.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setError(null);
    setBusyId(id);

    const response = await fetch(`/api/market/addresses/${id}`, { method: "DELETE" });
    setBusyId(null);

    if (!response.ok) {
      setError(await readApiError(response, "削除できませんでした"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="flex flex-col gap-3">
        {addresses.map((address) => (
          <li
            key={address.id}
            className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-4"
          >
            {editingId === address.id ? (
              <AddressForm
                initial={toFormValues(address)}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{address.recipientName}</span>
                    {address.isDefault ? (
                      <span className="rounded-full bg-brand-amber px-2 py-0.5 text-xs font-bold text-accent">
                        既定
                      </span>
                    ) : null}
                  </div>
                  <span className="text-muted">{formatAddress(address)}</span>
                  <span className="text-muted">{address.phone}</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditingId(address.id)}
                    className="px-3 py-1.5 text-xs"
                  >
                    編集
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => remove(address.id)}
                    disabled={busyId === address.id}
                    className="px-3 py-1.5 text-xs"
                  >
                    削除
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-line bg-raised p-4">
          <h2 className="mb-4 text-base font-bold">配送先を追加</h2>
          <AddressForm
            initial={EMPTY_ADDRESS}
            isFirst={addresses.length === 0}
            onDone={addresses.length === 0 ? undefined : () => setAdding(false)}
          />
        </div>
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="w-fit">
          配送先を追加
        </Button>
      )}

      {addresses.length > 0 ? (
        <p className="text-xs leading-5 text-subtle">
          配送先を直しても、すでに済んだ注文のお届け先は変わりません。
          郵便番号は {formatPostalCode("1234567")} の形で表示します。
        </p>
      ) : null}
    </div>
  );
}
