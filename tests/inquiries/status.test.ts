import { describe, expect, it } from "vitest";

import {
  INQUIRY_SENDER_ROLES,
  INQUIRY_STATUSES,
  MAX_MESSAGE_LENGTH,
  canCloseInquiry,
  canPostMessage,
  canReopenInquiry,
  isInquiryStatus,
  statusAfterMessage,
} from "@/lib/inquiries/status";

/**
 * 問い合わせの状態機械（0014）。
 *
 * ここで固定しているのは「画面と API と DB が同じ答えを出す」ための土台。
 * DB 側は 0014 のポリシー（`status <> 'closed'`）とトリガ
 * （`inquiry_touch_thread()`）が同じ規則を持っている。片方だけ直して
 * 食い違わせないよう、規則そのものをテストで書き留めておく。
 */

describe("isInquiryStatus", () => {
  it("宣言した 3 つだけを通す", () => {
    for (const status of INQUIRY_STATUSES) {
      expect(isInquiryStatus(status)).toBe(true);
    }
    // 状態を URL のクエリで受けるので、知らない値が来る前提で書く
    for (const value of ["", "OPEN", "deleted", "closed ", "open;drop"]) {
      expect(isInquiryStatus(value)).toBe(false);
    }
  });
});

describe("canPostMessage", () => {
  it("完了したスレッドには書き込めない", () => {
    expect(canPostMessage("open")).toBe(true);
    expect(canPostMessage("answered")).toBe(true);
    expect(canPostMessage("closed")).toBe(false);
  });
});

describe("statusAfterMessage", () => {
  it("テナントが答えたら回答済みへ移る", () => {
    expect(statusAfterMessage("open", "tenant")).toBe("answered");
    expect(statusAfterMessage("answered", "tenant")).toBe("answered");
  });

  it("購入者が追記したら未回答へ戻る", () => {
    // 戻さないと、回答済みに埋もれて追加の質問に気づけない
    expect(statusAfterMessage("answered", "buyer")).toBe("open");
    expect(statusAfterMessage("open", "buyer")).toBe("open");
  });

  it("完了はどちらが書いても動かない", () => {
    for (const sender of INQUIRY_SENDER_ROLES) {
      expect(statusAfterMessage("closed", sender)).toBe("closed");
    }
  });

  it("どの組み合わせでも宣言した状態のどれかになる", () => {
    for (const status of INQUIRY_STATUSES) {
      for (const sender of INQUIRY_SENDER_ROLES) {
        expect(INQUIRY_STATUSES).toContain(statusAfterMessage(status, sender));
      }
    }
  });
});

describe("完了と再開", () => {
  it("完了にできるのは完了していないものだけ", () => {
    expect(canCloseInquiry("open")).toBe(true);
    expect(canCloseInquiry("answered")).toBe(true);
    expect(canCloseInquiry("closed")).toBe(false);
  });

  it("再開できるのは完了したものだけ", () => {
    expect(canReopenInquiry("open")).toBe(false);
    expect(canReopenInquiry("answered")).toBe(false);
    expect(canReopenInquiry("closed")).toBe(true);
  });

  it("完了と再開は同時に押せない", () => {
    // どちらのボタンも出ている状態を作らない。押した結果が
    // 押した人の意図と違うものになる
    for (const status of INQUIRY_STATUSES) {
      expect(canCloseInquiry(status) && canReopenInquiry(status)).toBe(false);
    }
  });
});

describe("MAX_MESSAGE_LENGTH", () => {
  it("0014 の検査制約と同じ値", () => {
    // supabase/migrations/0014_product_inquiries.sql の
    // inquiry_message_body_length が length(body) <= 2000 で持っている。
    // ここを緩めると、画面は通るのに保存で落ちる
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
  });
});
