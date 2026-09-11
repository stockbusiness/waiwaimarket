/**
 * 商品画像の置き場所の規約と検証。
 *
 *   product-images/<tenant_id>/<product_id>/<乱数>.<拡張子>
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 検証が要る理由：0008 の Storage ポリシーは先頭フォルダが自テナントで
 * あることしか見ない。同じテナントの中であれば、別の商品のフォルダを
 * 指す product_images の行を作れてしまう。商品を消したときに実体が
 * 残ったり、他の商品の画像が消えたりする。
 */

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function imagePathPrefix(tenantId: string, productId: string): string {
  return `${tenantId}/${productId}/`;
}

/**
 * この商品のフォルダ直下の、素直なファイル名か。
 *
 * `..` や余分な階層を弾く。前方一致だけだと
 * `<tenant>/<product>/../<別の商品>/x.png` が通ってしまう。
 */
export function isOwnImagePath(
  path: string,
  tenantId: string,
  productId: string,
): boolean {
  const prefix = imagePathPrefix(tenantId, productId);
  if (!path.startsWith(prefix)) return false;

  const rest = path.slice(prefix.length);
  return rest.length > 0 && rest.length <= 120 && SEGMENT.test(rest);
}
