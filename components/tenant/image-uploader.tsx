"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/http/error-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 商品画像。実体はブラウザから直接 Storage へ上げる。
 *
 * サーバーを経由させるとファイルが 2 回転送され、Route Handler の
 * 本文サイズの制限も受ける。0008 の product_images_tenant_insert が
 * 「先頭フォルダが自テナント」を見るので、RLS と同じ強さで守られる。
 *
 * 置き場所：product-images/<tenant_id>/<product_id>/<乱数>.<拡張子>
 * 元のファイル名は使わない。日本語や空白や `..` がパスに混ざるうえ、
 * 同じ名前で上げ直すと前の画像が消える。
 */

export type ProductImage = { id: string; storagePath: string };

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function ImageUploader({
  productId,
  tenantId,
  images,
  publicUrlBase,
}: {
  productId: string;
  tenantId: string;
  images: ProductImage[];
  /** 公開バケットの配信元。`<supabaseUrl>/storage/v1/object/public/product-images/` */
  publicUrlBase: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setError(null);

    const extension = ACCEPTED[file.type];
    if (!extension) {
      setError("JPEG・PNG・WebP のいずれかを選んでください。");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("画像は 5MB までです。");
      return;
    }

    setBusy(true);
    const path = `${tenantId}/${productId}/${crypto.randomUUID()}.${extension}`;

    const supabase = createSupabaseBrowserClient("tenant");
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setBusy(false);
      setError(`画像をアップロードできませんでした（${uploadError.message}）`);
      return;
    }

    // 行の登録に失敗したら実体を消す。残すと誰からも参照されない孤児になる
    const response = await fetch(`/tenant/api/products/${productId}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storagePath: path }),
    });

    if (!response.ok) {
      await supabase.storage.from(BUCKET).remove([path]);
      setBusy(false);
      setError(await readApiError(response, "画像を登録できませんでした"));
      return;
    }

    setBusy(false);
    router.refresh();
  }

  async function remove(imageId: string) {
    setError(null);
    setBusy(true);

    const response = await fetch(
      `/tenant/api/products/${productId}/images/${imageId}`,
      { method: "DELETE" },
    );

    setBusy(false);

    if (!response.ok) {
      setError(await readApiError(response, "画像を削除できませんでした"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2">
              {/* next/image を使わない。Storage のホストごとに設定が要るうえ、
                  管理画面の数枚に最適化の価値がない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${publicUrlBase}${image.storagePath}`}
                alt={`商品画像 ${index + 1}`}
                className="aspect-square w-full max-w-full rounded-lg border border-line object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => remove(image.id)}
                disabled={busy}
                className="px-3 py-1.5 text-xs"
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">画像がまだありません。</p>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">画像を追加</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || images.length >= 10}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 同じファイルを選び直せるように、値を空に戻す
            event.target.value = "";
            if (file) void upload(file);
          }}
          className="text-base"
        />
        <span className="text-xs leading-5 text-subtle">
          JPEG・PNG・WebP、5MB まで。10 枚まで登録できます。
        </span>
      </label>
    </div>
  );
}
