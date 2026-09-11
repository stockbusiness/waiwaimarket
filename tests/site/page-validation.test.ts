import { describe, expect, it } from "vitest";

import { sitePageSchema } from "@/lib/validation/site-page";

const valid = {
  slug: "privacy",
  title: "プライバシーポリシー",
  sortOrder: 20,
  body: "## 1. 取得する情報\n\n本文",
  note: "初版",
  publish: true,
};

describe("sitePageSchema", () => {
  it("正しい入力を通す", () => {
    const parsed = sitePageSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("空のメモは undefined にする（DB へ空文字を入れない）", () => {
    const parsed = sitePageSchema.parse({ ...valid, note: "" });
    expect(parsed.note).toBeUndefined();
  });

  it("slug は英小文字・数字・ハイフンのみ", () => {
    for (const slug of ["Privacy", "privacy_policy", "プライバシー", "-privacy", "a--b"]) {
      expect(sitePageSchema.safeParse({ ...valid, slug }).success).toBe(false);
    }
  });

  it("予約済みの slug を拒む", () => {
    expect(sitePageSchema.safeParse({ ...valid, slug: "api" }).success).toBe(false);
    expect(sitePageSchema.safeParse({ ...valid, slug: "new" }).success).toBe(false);
  });

  it("本文が空なら拒む。公開中なのに本文が無い状態を作らせない", () => {
    expect(sitePageSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
    expect(sitePageSchema.safeParse({ ...valid, body: "   \n  " }).success).toBe(false);
  });

  it("並び順は 0 以上の整数", () => {
    expect(sitePageSchema.safeParse({ ...valid, sortOrder: -1 }).success).toBe(false);
    expect(sitePageSchema.safeParse({ ...valid, sortOrder: 1.5 }).success).toBe(false);
    // フォームからは文字列で届くため、数値に直せるものは通す
    expect(sitePageSchema.parse({ ...valid, sortOrder: "30" }).sortOrder).toBe(30);
  });

  it("publish は省略できない。既定で公開されると事故になる", () => {
    const withoutPublish: Record<string, unknown> = { ...valid };
    delete withoutPublish.publish;
    expect(sitePageSchema.safeParse(withoutPublish).success).toBe(false);
  });

  it("前後の空白を落とす", () => {
    const parsed = sitePageSchema.parse({ ...valid, title: "  会社概要  " });
    expect(parsed.title).toBe("会社概要");
  });
});
