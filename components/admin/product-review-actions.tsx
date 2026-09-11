"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { readApiError } from "@/lib/http/error-message";
import { audienceApiPath } from "@/lib/supabase/audience";
import { reviewRequiresNote, type ProductReviewAction } from "@/lib/products/status";

/**
 * 商品の承認・差戻し・販売停止・復帰。
 *
 * 理由は画面上のテキスト欄で受ける。テナント審査は window.prompt を
 * 使っているが、差戻しの理由はテナントがそのまま読む文章なので、
 * 書き直しながら整えられる必要がある（prompt は 1 行しか入らず、
 * スマートフォンでは特に書きづらい）。
 */

const LABELS: Record<ProductReviewAction, string> = {
  approve: "承認して公開する",
  reject: "差し戻す",
  suspend: "販売を停止する",
  reinstate: "販売を再開する",
};

export function ProductReviewActions({
  productId,
  actions,
  requiresHqAdmin,
}: {
  productId: string;
  actions: ProductReviewAction[];
  /** 本部管理者でないと押せない操作。押せない理由を先に見せる */
  requiresHqAdmin: ProductReviewAction[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ProductReviewAction | null>(null);

  async function run(action: ProductReviewAction) {
    // サーバー側（lib/products/review.ts）でも同じ判定をする。
    // ここは待たずに知らせるためで、これが守りではない
    if (reviewRequiresNote(action) && !note.trim()) {
      setError("差戻しと販売停止には理由が必要です。テナントの画面に表示されます。");
      return;
    }

    setError(null);
    setPending(action);

    const response = await fetch(audienceApiPath("hq", `products/${productId}/review`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note: note.trim() || undefined }),
    });

    setPending(null);

    if (!response.ok) {
      setError(await readApiError(response, "操作できませんでした"));
      return;
    }

    setNote("");
    router.refresh();
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="審査の所見"
        hint="差戻しと販売停止では必須です。テナントの商品画面にそのまま表示されます。監査ログにも残ります。"
      >
        <TextArea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="例：商品画像に第三者の商標が写り込んでいます。差し替えてください。"
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant={action === "approve" ? "primary" : "secondary"}
            onClick={() => run(action)}
            disabled={pending !== null}
          >
            {pending === action ? "実行中…" : LABELS[action]}
          </Button>
        ))}
      </div>

      {requiresHqAdmin.length > 0 ? (
        <p className="text-xs leading-5 text-subtle">
          {requiresHqAdmin.map((action) => LABELS[action]).join("・")}
          は本部管理者のみが行えます（多要素認証が必要です）。
        </p>
      ) : null}
    </div>
  );
}
