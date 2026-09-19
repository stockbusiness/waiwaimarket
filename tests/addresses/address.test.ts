import { describe, expect, it } from "vitest";

import {
  SHIPPING_ADDRESS_VERSION,
  formatAddress,
  formatPostalCode,
  normalizePhone,
  normalizePostalCode,
  parseSnapshot,
  toSnapshot,
  type Address,
} from "@/lib/addresses/address";
import { addressSchema } from "@/lib/validation/address";

function address(over: Partial<Address> = {}): Address {
  return {
    recipientName: "山田 太郎",
    phone: "09012345678",
    postalCode: "1500001",
    prefectureCode: "13",
    city: "渋谷区",
    addressLine1: "神宮前 1-2-3",
    addressLine2: "ワイワイビル 501",
    ...over,
  };
}

describe("郵便番号の正規化", () => {
  it("ハイフンの有無を吸収する", () => {
    expect(normalizePostalCode("150-0001")).toBe("1500001");
    expect(normalizePostalCode("1500001")).toBe("1500001");
  });

  it("全角の数字とハイフンを直す", () => {
    // スマートフォンの日本語入力では全角のまま確定されることが多い。
    // 弾くと打ち直させるだけで得るものが無い
    expect(normalizePostalCode("１５０ー０００１")).toBe("1500001");
    expect(normalizePostalCode("１５００００１")).toBe("1500001");
  });

  it("長音符・ダッシュ類もハイフンとして扱う", () => {
    // 見た目が同じで区別できない
    for (const dash of ["-", "−", "–", "—", "―", "‐", "ー", "〜"]) {
      expect(normalizePostalCode(`150${dash}0001`)).toBe("1500001");
    }
  });

  it("前後の空白を落とす", () => {
    expect(normalizePostalCode("  150-0001  ")).toBe("1500001");
  });

  it("桁が違えば null", () => {
    expect(normalizePostalCode("15000")).toBeNull();
    expect(normalizePostalCode("15000012")).toBeNull();
    expect(normalizePostalCode("")).toBeNull();
    expect(normalizePostalCode("abcdefg")).toBeNull();
  });

  it("表示はハイフン付き", () => {
    expect(formatPostalCode("1500001")).toBe("150-0001");
  });
});

describe("電話番号の正規化", () => {
  it("ハイフンと括弧を落とす", () => {
    expect(normalizePhone("090-1234-5678")).toBe("09012345678");
    expect(normalizePhone("03(1234)5678")).toBe("0312345678");
    expect(normalizePhone("03 1234 5678")).toBe("0312345678");
  });

  it("全角を直す", () => {
    expect(normalizePhone("０９０ー１２３４ー５６７８")).toBe("09012345678");
  });

  it("国番号付きを国内表記に直す", () => {
    expect(normalizePhone("+81-90-1234-5678")).toBe("09012345678");
    expect(normalizePhone("819012345678")).toBe("09012345678");
  });

  it("10 桁と 11 桁を受ける", () => {
    expect(normalizePhone("0312345678")).toBe("0312345678");
    expect(normalizePhone("09012345678")).toBe("09012345678");
  });

  it("0 で始まらない・桁が違うものは null", () => {
    expect(normalizePhone("9012345678")).toBeNull();
    expect(normalizePhone("031234567")).toBeNull();
    expect(normalizePhone("090123456789")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("表示", () => {
  it("1 行にまとめる。都道府県は名前に直す", () => {
    expect(formatAddress(address())).toBe(
      "〒150-0001 東京都 渋谷区 神宮前 1-2-3 ワイワイビル 501",
    );
  });

  it("建物名が無くても余分な空白が入らない", () => {
    expect(formatAddress(address({ addressLine2: null }))).toBe(
      "〒150-0001 東京都 渋谷区 神宮前 1-2-3",
    );
  });
});

describe("注文への写し取り", () => {
  it("version が付く", () => {
    const snapshot = toSnapshot(address());
    expect(snapshot.version).toBe(SHIPPING_ADDRESS_VERSION);
    expect(snapshot.recipientName).toBe("山田 太郎");
  });

  it("写した形をそのまま読み戻せる", () => {
    const snapshot = toSnapshot(address());
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
  });

  it("版が違えば読まない", () => {
    expect(parseSnapshot({ ...toSnapshot(address()), version: 2 })).toBeNull();
  });

  it("形が壊れていれば null（例外にしない）", () => {
    // 注文画面が例外で落ちるより、「住所を表示できません」と出すほうがよい
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("住所")).toBeNull();
    expect(parseSnapshot({ ...toSnapshot(address()), postalCode: "150-0001" })).toBeNull();
    expect(parseSnapshot({ ...toSnapshot(address()), prefectureCode: "48" })).toBeNull();
    expect(parseSnapshot({ ...toSnapshot(address()), recipientName: "   " })).toBeNull();
    expect(parseSnapshot({ ...toSnapshot(address()), phone: "9012345678" })).toBeNull();
  });

  it("建物名の空文字は null にする", () => {
    const parsed = parseSnapshot({ ...toSnapshot(address()), addressLine2: "" });
    expect(parsed?.addressLine2).toBeNull();
  });
});

describe("入力の検証", () => {
  const input = {
    recipientName: "山田 太郎",
    phone: "090-1234-5678",
    postalCode: "150-0001",
    prefectureCode: "13",
    city: "渋谷区",
    addressLine1: "神宮前 1-2-3",
  };

  it("素直な入力を通し、正規化して返す", () => {
    const parsed = addressSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.postalCode).toBe("1500001");
    expect(parsed.data.phone).toBe("09012345678");
    expect(parsed.data.addressLine2).toBeNull();
    expect(parsed.data.isDefault).toBe(false);
  });

  it("全角のまま送られても通す", () => {
    const parsed = addressSchema.safeParse({
      ...input,
      postalCode: "１５０ー０００１",
      phone: "０９０ー１２３４ー５６７８",
    });
    expect(parsed.success).toBe(true);
  });

  it("建物名の空文字は null になる", () => {
    const parsed = addressSchema.safeParse({ ...input, addressLine2: "  " });
    expect(parsed.success && parsed.data.addressLine2).toBeNull();
  });

  it("空白だけの項目を弾く", () => {
    expect(addressSchema.safeParse({ ...input, recipientName: "   " }).success).toBe(false);
    expect(addressSchema.safeParse({ ...input, city: "" }).success).toBe(false);
  });

  it("知らない都道府県コードを弾く", () => {
    expect(addressSchema.safeParse({ ...input, prefectureCode: "48" }).success).toBe(false);
    // 0 落ちも弾く。DB の正規表現（0013）と食い違わせない
    expect(addressSchema.safeParse({ ...input, prefectureCode: "1" }).success).toBe(false);
  });

  it("長すぎる項目を弾く", () => {
    expect(
      addressSchema.safeParse({ ...input, recipientName: "あ".repeat(61) }).success,
    ).toBe(false);
    expect(
      addressSchema.safeParse({ ...input, addressLine1: "あ".repeat(101) }).success,
    ).toBe(false);
  });
});
