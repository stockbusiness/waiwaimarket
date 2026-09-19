"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { basisPointsToPercentText } from "@/lib/points/labels";
import { BASIS_POINTS, parsePercent } from "@/lib/points/rules";

/**
 * 基本還元ルールの変更（docs/02 6.1）。
 *
 * **保存すると新しい版が積まれる。** 上書きではない。前の版は
 * `effective_to` が入って閉じるだけで、過去の注文はそのときのルールで
 * 計算されたまま変わらない（CLAUDE.md「ルール変更を既存注文に遡及適用しない」）。
 *
 * **比率は「％」で受け取って万分率の整数で送る。** 小数のまま送ると
 * `Number("0.0003")` の下振れと同じ経路に乗る（`lib/points/rules.ts`）。
 */

type Props = {
  /** いま効いている版の id。これを条件に閉じるので必須 */
  currentId: string;
  initial: {
    rateBasisPoints: number;
    usageCapBasisPoints: number;
    confirmAfterDays: number;
    expireAfterMonths: number;
  };
};

/** 入力の目安。1,000 円の買い物で何ポイント付くか */
const SAMPLE_AMOUNT = 1000;

export function PointRuleForm({ currentId, initial }: Props) {
  const router = useRouter();
  const [rate, setRate] = useState(basisPointsToPercentText(initial.rateBasisPoints));
  const [cap, setCap] = useState(
    basisPointsToPercentText(initial.usageCapBasisPoints),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const rateBasisPoints = parsePercent(rate);
  const capBasisPoints = parsePercent(cap);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    // 比率だけは送る前に確かめる。読めない値を 0 として送ると、
    // 打ち間違いが「還元 0%」として保存される
    if (rateBasisPoints === null) {
      setError("還元率は 0 〜 100 の数字で、小数は第 2 位までで入力してください。");
      return;
    }
    if (capBasisPoints === null || capBasisPoints === 0) {
      setError("利用上限は 0 より大きい数字で入力してください。");
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);

    const response = await fetch("/admin/api/point-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentId,
        rule: {
          rateBasisPoints,
          usageCapBasisPoints: capBasisPoints,
          confirmAfterDays: Number(form.get("confirmAfterDays") ?? 0),
          expireAfterMonths: Number(form.get("expireAfterMonths") ?? 0),
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
    <form onSubmit={save} className="flex flex-col gap-5">
      <Field
        label="還元率"
        required
        hint={
          rateBasisPoints === null
            ? "0 〜 100 の数字（小数は第 2 位まで）"
            : `1,000 円のお買い物で ${Math.floor(
                (SAMPLE_AMOUNT * rateBasisPoints) / BASIS_POINTS,
              )} ポイント`
        }
      >
        <div className="flex items-center gap-2">
          <TextInput
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            inputMode="decimal"
            required
            maxLength={6}
            className="max-w-32"
          />
          <span className="text-sm text-muted">％</span>
        </div>
      </Field>

      <Field
        label="1 回のお買い物で使える上限"
        required
        hint="商品代金に対する割合。50 なら半額まで"
      >
        <div className="flex items-center gap-2">
          <TextInput
            value={cap}
            onChange={(event) => setCap(event.target.value)}
            inputMode="decimal"
            required
            maxLength={6}
            className="max-w-32"
          />
          <span className="text-sm text-muted">％</span>
        </div>
      </Field>

      <Field
        label="確定までの日数"
        required
        hint="発送のご連絡から何日後に使えるようになるか。返品期間より長くする"
      >
        <div className="flex items-center gap-2">
          <TextInput
            name="confirmAfterDays"
            type="number"
            defaultValue={initial.confirmAfterDays}
            min={0}
            max={180}
            required
            inputMode="numeric"
            className="max-w-32"
          />
          <span className="text-sm text-muted">日</span>
        </div>
      </Field>

      <Field label="有効期限" required hint="付与した日から何か月で失効するか">
        <div className="flex items-center gap-2">
          <TextInput
            name="expireAfterMonths"
            type="number"
            defaultValue={initial.expireAfterMonths}
            min={1}
            max={120}
            required
            inputMode="numeric"
            className="max-w-32"
          />
          <span className="text-sm text-muted">か月</span>
        </div>
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? (
        <Alert tone="success">
          新しい版として保存しました。これ以降のご注文に適用されます。
          すでにあるご注文の還元率は変わりません。
        </Alert>
      ) : null}

      <div>
        <Button type="submit" disabled={busy}>
          変更を保存する
        </Button>
      </div>
    </form>
  );
}
