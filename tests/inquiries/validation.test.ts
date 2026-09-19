import { describe, expect, it } from "vitest";

import { MAX_MESSAGE_LENGTH } from "@/lib/inquiries/status";
import {
  inquiryActionSchema,
  inquiryCreateSchema,
  inquiryMessageSchema,
} from "@/lib/validation/inquiry";

const PRODUCT_ID = "f0000000-0000-4000-8000-000000000001";

describe("inquiryCreateSchema", () => {
  it("商品IDと本文だけを受け取る", () => {
    const parsed = inquiryCreateSchema.parse({
      productId: PRODUCT_ID,
      body: "  在庫はありますか  ",
      // 宛先を渡されても拾わない。テナントは商品から引き直す
      tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    });

    expect(parsed).toEqual({ productId: PRODUCT_ID, body: "在庫はありますか" });
    expect(Object.keys(parsed)).not.toContain("tenantId");
  });

  it("商品IDが UUID でなければ拒否する", () => {
    expect(inquiryCreateSchema.safeParse({ productId: "1", body: "あ" }).success).toBe(
      false,
    );
  });
});

describe("inquiryMessageSchema", () => {
  it("空白だけの本文を拒否する", () => {
    // 0014 の inquiry_message_body_not_blank と同じものを弾く。
    // 空の発言が積もると、やり取りの記録として読めなくなる
    for (const body of ["", "   ", "\n\n", "　"]) {
      expect(inquiryMessageSchema.safeParse({ body }).success).toBe(false);
    }
  });

  it("上限ちょうどは通り、1 文字超えると拒否する", () => {
    const limit = "あ".repeat(MAX_MESSAGE_LENGTH);
    expect(inquiryMessageSchema.safeParse({ body: limit }).success).toBe(true);
    expect(inquiryMessageSchema.safeParse({ body: `${limit}あ` }).success).toBe(false);
  });

  it("前後の空白を落としてから長さを測る", () => {
    // 落とす前に測ると、画面では通るのに DB の btrim 後の値で
    // 食い違う、ということが起きる
    const padded = `  ${"あ".repeat(MAX_MESSAGE_LENGTH)}  `;
    const parsed = inquiryMessageSchema.parse({ body: padded });
    expect(parsed.body).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe("inquiryActionSchema", () => {
  it("close と reopen だけを受け取る", () => {
    expect(inquiryActionSchema.parse({ action: "close" }).action).toBe("close");
    expect(inquiryActionSchema.parse({ action: "reopen" }).action).toBe("reopen");
    // 状態名をそのまま送られても通さない。遷移は action で表す
    for (const action of ["closed", "open", "answered", "delete"]) {
      expect(inquiryActionSchema.safeParse({ action }).success).toBe(false);
    }
  });
});
