import Link from "next/link";

import { formatPriceRange } from "@/lib/products/price";
import type { ProductListItem } from "@/lib/products/public";

/**
 * 一覧の 1 件。カード全体をリンクにする。
 *
 * 画像・商品名・店舗名・価格の順に置く。指で押す面を広く取りたいので、
 * 商品名だけをリンクにはしない。
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    // h-full と w-full を明示する。これが無いと a が内容の幅に縮み、
    // 画像のある札だけ img に押し広げられて、画像の無い札が細くなる
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-raised p-3 transition-colors hover:border-accent"
    >
      <div className="relative aspect-square w-full max-w-full overflow-hidden rounded-lg bg-surface">
        {product.imageUrl ? (
          /* next/image を使わない。Storage のホストごとに設定が要るうえ、
             画像はすでに商品登録時に枚数と容量を絞ってある */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-subtle">
            画像なし
          </span>
        )}

        {product.inStock ? null : (
          <span className="absolute inset-x-0 bottom-0 bg-body/80 py-1 text-center text-xs font-bold text-surface">
            在庫なし
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="line-clamp-2 text-sm font-medium group-hover:text-accent">
          {product.title}
        </span>
        {product.storeName ? (
          <span className="truncate text-xs text-muted">{product.storeName}</span>
        ) : null}
        <span className="text-sm font-bold">{formatPriceRange(product.price)}</span>
      </div>
    </Link>
  );
}

/** 一覧の並び。スマートフォンで 2 列、広い画面で 4 列 */
export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
