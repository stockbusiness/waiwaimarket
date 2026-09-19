"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { PREFECTURES } from "@/lib/shipping/prefectures";

/**
 * 配送先の入力（docs/00 5.1）。
 *
 * **郵便番号と電話番号は全角のままでも受ける。** スマートフォンの日本語入力
 * では全角で確定されることが多い。サーバー側（lib/addresses/address.ts）が
 * 半角に直すので、ここで弾かない。
 *
 * 都道府県は地域別送料と同じコード（JIS X 0401）で送る。名前で送ると
 * 表記ゆれで送料の突き合わせが外れる。
 */

export type AddressFormValues = {
  id?: string;
  recipientName: string;
  phone: string;
  postalCode: string;
  prefectureCode: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  isDefault: boolean;
};

export const EMPTY_ADDRESS: AddressFormValues = {
  recipientName: "",
  phone: "",
  postalCode: "",
  prefectureCode: "13",
  city: "",
  addressLine1: "",
  addressLine2: "",
  isDefault: false,
};

export function AddressForm({
  initial,
  /** 既に登録済みの住所が 1 件も無い。既定の指定を出しても意味がない */
  isFirst = false,
  onDone,
}: {
  initial: AddressFormValues;
  isFirst?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      recipientName: String(form.get("recipientName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      postalCode: String(form.get("postalCode") ?? ""),
      prefectureCode: String(form.get("prefectureCode") ?? ""),
      city: String(form.get("city") ?? ""),
      addressLine1: String(form.get("addressLine1") ?? ""),
      addressLine2: String(form.get("addressLine2") ?? ""),
      isDefault: form.get("isDefault") === "on",
    };

    const response = await fetch(
      initial.id ? `/api/market/addresses/${initial.id}` : "/api/market/addresses",
      {
        method: initial.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "保存できませんでした"));
      return;
    }

    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="お名前" required>
        <TextInput
          name="recipientName"
          defaultValue={initial.recipientName}
          required
          maxLength={60}
          autoComplete="name"
        />
      </Field>

      <Field label="電話番号" required hint="ハイフンは入れても入れなくても構いません">
        <TextInput
          name="phone"
          type="tel"
          defaultValue={initial.phone}
          required
          inputMode="tel"
          autoComplete="tel"
        />
      </Field>

      <Field label="郵便番号" required hint="7 桁。ハイフンは入れても入れなくても構いません">
        <TextInput
          name="postalCode"
          defaultValue={initial.postalCode}
          required
          inputMode="numeric"
          autoComplete="postal-code"
          className="max-w-40"
        />
      </Field>

      <Field label="都道府県" required>
        <select
          name="prefectureCode"
          defaultValue={initial.prefectureCode}
          required
          autoComplete="address-level1"
          className="w-full rounded-md border border-line-strong bg-raised px-3 py-2.5 text-base text-body"
        >
          {PREFECTURES.map((pref) => (
            <option key={pref.code} value={pref.code}>
              {pref.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="市区町村" required>
        <TextInput
          name="city"
          defaultValue={initial.city}
          required
          maxLength={60}
          autoComplete="address-level2"
        />
      </Field>

      <Field label="番地" required>
        <TextInput
          name="addressLine1"
          defaultValue={initial.addressLine1}
          required
          maxLength={100}
          autoComplete="address-line1"
        />
      </Field>

      <Field label="建物名・部屋番号">
        <TextInput
          name="addressLine2"
          defaultValue={initial.addressLine2}
          maxLength={100}
          autoComplete="address-line2"
        />
      </Field>

      {isFirst ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={initial.isDefault}
            className="size-4 shrink-0"
          />
          <span>既定の配送先にする</span>
        </label>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} className="w-fit">
          {busy ? "保存中…" : "保存する"}
        </Button>
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone} className="w-fit">
            やめる
          </Button>
        ) : null}
      </div>
    </form>
  );
}
