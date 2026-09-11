import { describe, expect, it } from "vitest";

import { imagePathPrefix, isOwnImagePath } from "@/lib/products/image-path";

/**
 * 0008 の Storage ポリシーは先頭フォルダが自テナントであることしか見ない。
 * 同じテナントの中で別の商品のフォルダを指す行を作れてしまうため、
 * アプリ側で商品まで縛る。ここはその判定を固定する。
 */

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const PRODUCT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const OTHER_PRODUCT = "cccccccc-cccc-cccc-cccc-ccccccccccc1";

describe("imagePathPrefix", () => {
  it("テナント／商品の順でフォルダを作る（0008 のポリシーが先頭を見るため）", () => {
    expect(imagePathPrefix(TENANT, PRODUCT)).toBe(`${TENANT}/${PRODUCT}/`);
  });
});

describe("isOwnImagePath", () => {
  it("自分の商品のフォルダ直下を通す", () => {
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/abc123.png`, TENANT, PRODUCT)).toBe(true);
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/a-b_c.webp`, TENANT, PRODUCT)).toBe(true);
  });

  it("別の商品・別のテナントのフォルダを弾く", () => {
    expect(isOwnImagePath(`${TENANT}/${OTHER_PRODUCT}/a.png`, TENANT, PRODUCT)).toBe(false);
    expect(isOwnImagePath(`${OTHER_PRODUCT}/${PRODUCT}/a.png`, TENANT, PRODUCT)).toBe(false);
  });

  it("前方一致だけでは通さない。.. で外へ出る経路を弾く", () => {
    expect(
      isOwnImagePath(`${TENANT}/${PRODUCT}/../${OTHER_PRODUCT}/a.png`, TENANT, PRODUCT),
    ).toBe(false);
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/..`, TENANT, PRODUCT)).toBe(false);
  });

  it("さらに深い階層を弾く", () => {
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/sub/a.png`, TENANT, PRODUCT)).toBe(false);
  });

  it("空のファイル名と長すぎる名前を弾く", () => {
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/`, TENANT, PRODUCT)).toBe(false);
    expect(
      isOwnImagePath(`${TENANT}/${PRODUCT}/${"a".repeat(121)}`, TENANT, PRODUCT),
    ).toBe(false);
  });

  it("前後に空白や制御文字が混ざったものを弾く", () => {
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/ a.png`, TENANT, PRODUCT)).toBe(false);
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/a b.png`, TENANT, PRODUCT)).toBe(false);
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/a\n.png`, TENANT, PRODUCT)).toBe(false);
  });

  it("先頭が . のファイル名を弾く（隠しファイルや相対指定）", () => {
    expect(isOwnImagePath(`${TENANT}/${PRODUCT}/.hidden`, TENANT, PRODUCT)).toBe(false);
  });
});
