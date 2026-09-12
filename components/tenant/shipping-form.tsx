"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { PREFECTURES } from "@/lib/shipping/prefectures";
import { REGION_RULES_VERSION } from "@/lib/shipping/region";
import { audienceApiPath } from "@/lib/supabase/audience";

/**
 * 送料と発送日数の設定（docs/00 5.2）。
 *
 * 地域別送料は「都道府県を選んで金額を入れる」行を積む形にする
 * （lib/shipping/region.ts）。
 *
 * **既に他の行で選ばれている都道府県は選べないようにする。** 重複は
 * 保存時にも弾かれるが、47 個のチェックを見比べてどこが重複したかを
 * 探させるのは酷なので、そもそも押せないようにする。
 */

export type RegionRuleDraft = { prefectures: string[]; fee: string };

type Row = RegionRuleDraft & { key: string };

let nextKey = 0;
function makeRow(draft: RegionRuleDraft): Row {
  nextKey += 1;
  return { ...draft, key: `rule-${nextKey}` };
}

export function ShippingForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: {
    name: string;
    baseFee: string;
    freeThreshold: string;
    leadTimeDays: string;
    regionRules: RegionRuleDraft[];
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => initial.regionRules.map(makeRow));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (rows.some((row) => row.prefectures.length === 0)) {
      setError("都道府県が選ばれていない地域別送料があります。");
      return;
    }

    setBusy(true);
    const form = new FormData(event.currentTarget);
    const threshold = String(form.get("freeThreshold") ?? "").trim();

    const response = await fetch(audienceApiPath("tenant", "shipping"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        name: String(form.get("name") ?? ""),
        baseFee: String(form.get("baseFee") ?? "0"),
        // 空欄は「しきい値なし」。0 と区別する
        freeThreshold: threshold === "" ? null : threshold,
        leadTimeDays: String(form.get("leadTimeDays") ?? "3"),
        regionRules: {
          version: REGION_RULES_VERSION,
          rules: rows.map((row) => ({
            prefectures: row.prefectures,
            fee: Number(row.fee === "" ? 0 : row.fee),
          })),
        },
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="名称" required hint="社内で見分けるための名前です">
        <TextInput name="name" defaultValue={initial.name} required maxLength={60} />
      </Field>

      <Field label="基本送料（円）" required hint="下の地域別送料に出てこない都道府県はこの金額です">
        <TextInput
          name="baseFee"
          type="number"
          defaultValue={initial.baseFee}
          min={0}
          max={100000}
          step={1}
          required
          inputMode="numeric"
        />
      </Field>

      <Field
        label="送料無料になる金額（円）"
        hint="空欄なら常に送料がかかります。入力した金額ちょうどでも無料になります。地域別送料より優先します"
      >
        <TextInput
          name="freeThreshold"
          type="number"
          defaultValue={initial.freeThreshold}
          min={1}
          max={1000000}
          step={1}
          inputMode="numeric"
        />
      </Field>

      <Field label="発送までの目安（日）" required hint="商品ページと購入手続きに表示されます">
        <TextInput
          name="leadTimeDays"
          type="number"
          defaultValue={initial.leadTimeDays}
          min={0}
          max={60}
          step={1}
          required
          inputMode="numeric"
        />
      </Field>

      <RegionRules rows={rows} onChange={setRows} />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">保存しました。</Alert> : null}

      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? "保存中…" : "保存する"}
      </Button>
    </form>
  );
}

function RegionRules({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  // 他の行で使われている都道府県。押せないようにするために引く
  const usedByOthers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const others = new Set<string>();
      for (const other of rows) {
        if (other.key === row.key) continue;
        for (const code of other.prefectures) others.add(code);
      }
      map.set(row.key, others);
    }
    return map;
  }, [rows]);

  function update(key: string, patch: Partial<RegionRuleDraft>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function toggle(key: string, code: string) {
    const row = rows.find((item) => item.key === key);
    if (!row) return;
    const next = row.prefectures.includes(code)
      ? row.prefectures.filter((value) => value !== code)
      : [...row.prefectures, code];
    // コード順に保つ。保存した順に並ぶと、次に開いたとき探しづらい
    next.sort();
    update(key, { prefectures: next });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-bold">地域別送料</legend>

      <p className="text-xs leading-5 text-subtle">
        都道府県ごとに基本送料と違う金額を設定できます。ここに出てこない都道府県は
        基本送料です。離島や中継料のように都道府県では分けられないものは、
        まだ設定できません。
      </p>

      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-2 rounded-lg bg-surface p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">送料（円）</span>
              <TextInput
                type="number"
                value={row.fee}
                onChange={(event) => update(row.key, { fee: event.target.value })}
                min={0}
                max={100000}
                step={1}
                required
                inputMode="numeric"
                // TextInput は w-full を持つ。w-32 を足しても Tailwind の
                // 出力順で w-full が勝つため、max-w で絞る
                className="max-w-32"
                aria-label="この地域の送料（円）"
              />
            </label>

            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
              className="px-3 py-1.5 text-xs"
            >
              この行を削除
            </Button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer rounded-sm py-1 text-xs text-muted">
              対象の都道府県（{row.prefectures.length} 件選択中）
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
              {PREFECTURES.map((pref) => {
                const taken = usedByOthers.get(row.key)?.has(pref.code) ?? false;
                return (
                  <label
                    key={pref.code}
                    className={`flex items-center gap-2 text-xs ${
                      taken ? "text-subtle" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.prefectures.includes(pref.code)}
                      disabled={taken}
                      onChange={() => toggle(row.key, pref.code)}
                      className="size-4 shrink-0"
                    />
                    <span>{pref.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-subtle">
              薄い都道府県は、ほかの行で既に指定されています。
            </p>
          </details>

          {row.prefectures.length === 0 ? (
            <p className="text-xs font-bold text-danger">都道府県を選んでください。</p>
          ) : (
            <p className="text-xs text-muted">
              {row.prefectures
                .map((code) => PREFECTURES.find((pref) => pref.code === code)?.name ?? code)
                .join("・")}
            </p>
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...rows, makeRow({ prefectures: [], fee: "" })])}
        className="w-fit px-3 py-1.5 text-xs"
      >
        地域別送料を追加
      </Button>
    </fieldset>
  );
}
