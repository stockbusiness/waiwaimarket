import { describe, expect, it } from "vitest";

import { expiresAt, confirmAt } from "@/lib/points/expiry";
import { ledgerKey } from "@/lib/points/idempotency";

/**
 * 処理キーと期限（docs/02 6.5、6.1）。
 *
 * 「すべての付与・利用・取消に一意な処理キーを持たせる」
 * 「order_item_id + event_type + sequence 等で重複を拒否する」
 *
 * キーは point_ledger_entries.idempotency_key の unique 制約と対になる。
 * 同じ注文で二重付与されないことは、この文字列が一致することで担保する。
 */

describe("処理キー", () => {
  const item = "11111111-1111-4111-8111-111111111111";

  it("同じ注文明細・同じ種別・同じ連番なら同じキー", () => {
    expect(ledgerKey({ orderItemId: item, entryType: "earn_pending", sequence: 1 })).toBe(
      ledgerKey({ orderItemId: item, entryType: "earn_pending", sequence: 1 }),
    );
  });

  it("種別が違えば別のキー", () => {
    // 同じ明細に付与予定と確定の両方が立つ
    expect(ledgerKey({ orderItemId: item, entryType: "earn_pending", sequence: 1 })).not.toBe(
      ledgerKey({ orderItemId: item, entryType: "earn_confirmed", sequence: 1 }),
    );
  });

  it("連番が違えば別のキー", () => {
    // 部分返品を繰り返すと、同じ明細に取消が複数立つ
    expect(ledgerKey({ orderItemId: item, entryType: "earn_reversal", sequence: 1 })).not.toBe(
      ledgerKey({ orderItemId: item, entryType: "earn_reversal", sequence: 2 }),
    );
  });

  it("明細が違えば別のキー", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(ledgerKey({ orderItemId: item, entryType: "spend", sequence: 1 })).not.toBe(
      ledgerKey({ orderItemId: other, entryType: "spend", sequence: 1 }),
    );
  });

  it("明細に紐づかない行（失効など）はロットで作る", () => {
    const lot = "33333333-3333-4333-8333-333333333333";
    const key = ledgerKey({ lotId: lot, entryType: "expire", sequence: 1 });
    expect(key).toContain("expire");
    expect(key).not.toBe(ledgerKey({ lotId: lot, entryType: "expire", sequence: 2 }));
  });

  it("区切り文字が値に混ざっても別物になる", () => {
    // 連結だけだと "a:b" + "c" と "a" + "b:c" が衝突しうる。
    // uuid なら起きないが、キーの作り方として塞いでおく
    expect(ledgerKey({ orderItemId: "a:b", entryType: "spend", sequence: 1 })).not.toBe(
      ledgerKey({ orderItemId: "a", entryType: "spend", sequence: 1 }),
    );
  });

  it("連番は 1 以上", () => {
    expect(() => ledgerKey({ orderItemId: item, entryType: "spend", sequence: 0 })).toThrow();
  });

  it("対象が無ければ例外", () => {
    expect(() => ledgerKey({ entryType: "spend", sequence: 1 })).toThrow();
  });
});

describe("有効期限", () => {
  it("付与日から 12 か月", () => {
    expect(expiresAt(new Date("2026-09-19T00:00:00Z"), 12).toISOString()).toBe(
      "2027-09-19T00:00:00.000Z",
    );
  });

  it("月数を変えられる（管理画面から変更可能、docs/02 6.1）", () => {
    expect(expiresAt(new Date("2026-09-19T00:00:00Z"), 6).toISOString()).toBe(
      "2027-03-19T00:00:00.000Z",
    );
  });

  it("存在しない日は月末へ丸める。翌月へ繰り上げない", () => {
    // 1/31 の 1 か月後は 2/31。放っておくと 3/3 になり、期限が
    // 案内より延びる。短い側へ倒して「表示した期限までは必ず使える」を保つ
    expect(expiresAt(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(expiresAt(new Date("2026-03-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-04-30T00:00:00.000Z",
    );
  });

  it("うるう年の 2/29 に付与したら翌年は 2/28", () => {
    expect(expiresAt(new Date("2028-02-29T00:00:00Z"), 12).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });

  it("うるう年へ向かうときは 2/29 のまま", () => {
    expect(expiresAt(new Date("2027-02-28T00:00:00Z"), 12).toISOString()).toBe(
      "2028-02-28T00:00:00.000Z",
    );
  });

  it("時刻は保つ", () => {
    expect(expiresAt(new Date("2026-09-19T13:45:30.000Z"), 12).toISOString()).toBe(
      "2027-09-19T13:45:30.000Z",
    );
  });

  it("月数が 0 以下なら例外", () => {
    expect(() => expiresAt(new Date("2026-09-19T00:00:00Z"), 0)).toThrow();
  });
});

describe("確定日", () => {
  it("発送登録日から 14 日", () => {
    expect(confirmAt(new Date("2026-09-19T00:00:00Z"), 14).toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
  });

  it("月をまたいでも日数で数える", () => {
    expect(confirmAt(new Date("2026-02-20T00:00:00Z"), 14).toISOString()).toBe(
      "2026-03-06T00:00:00.000Z",
    );
  });

  it("0 日なら即時", () => {
    expect(confirmAt(new Date("2026-09-19T00:00:00Z"), 0).toISOString()).toBe(
      "2026-09-19T00:00:00.000Z",
    );
  });

  it("負の日数は例外", () => {
    expect(() => confirmAt(new Date("2026-09-19T00:00:00Z"), -1)).toThrow();
  });
});
