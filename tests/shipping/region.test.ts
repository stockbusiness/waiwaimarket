import { describe, expect, it } from "vitest";

import { PREFECTURES, isPrefectureCode, prefectureName } from "@/lib/shipping/prefectures";
import {
  EMPTY_REGION_RULES,
  feeRange,
  parseRegionRules,
  regionFee,
  regionRulesSchema,
} from "@/lib/shipping/region";

describe("都道府県コード", () => {
  it("47 件、01〜47 が欠けずに並ぶ", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES.map((pref) => pref.code)).toEqual(
      Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, "0")),
    );
  });

  it("コードと名前が 1 対 1", () => {
    const names = new Set(PREFECTURES.map((pref) => pref.name));
    expect(names.size).toBe(47);
  });

  it("端と外れ値", () => {
    expect(isPrefectureCode("01")).toBe(true);
    expect(isPrefectureCode("47")).toBe(true);
    // 0 落ちの "1" を通すと、DB 側の正規表現（0012）と食い違う
    expect(isPrefectureCode("1")).toBe(false);
    expect(isPrefectureCode("00")).toBe(false);
    expect(isPrefectureCode("48")).toBe(false);
    expect(isPrefectureCode(13)).toBe(false);
    expect(prefectureName("13")).toBe("東京都");
    expect(prefectureName("99")).toBeNull();
  });
});

describe("保存する形の検証", () => {
  it("素直な形を通す", () => {
    const value = { version: 1, rules: [{ prefectures: ["01", "47"], fee: 1500 }] };
    expect(regionRulesSchema.safeParse(value).success).toBe(true);
  });

  it("空のルールを通す", () => {
    expect(regionRulesSchema.safeParse(EMPTY_REGION_RULES).success).toBe(true);
  });

  it("同じ都道府県が 2 つのルールに出たら弾く", () => {
    // 通すと、どちらの金額になるかが配列の順序で決まる。
    // テナントの画面に順序は見えないので、意図しない金額が黙って選ばれる
    const value = {
      version: 1,
      rules: [
        { prefectures: ["47"], fee: 1500 },
        { prefectures: ["46", "47"], fee: 900 },
      ],
    };
    expect(regionRulesSchema.safeParse(value).success).toBe(false);
  });

  it("版が違えば弾く", () => {
    expect(regionRulesSchema.safeParse({ version: 2, rules: [] }).success).toBe(false);
  });

  it("都道府県が空のルールを弾く", () => {
    const value = { version: 1, rules: [{ prefectures: [], fee: 900 }] };
    expect(regionRulesSchema.safeParse(value).success).toBe(false);
  });

  it("知らない都道府県コードを弾く", () => {
    const value = { version: 1, rules: [{ prefectures: ["48"], fee: 900 }] };
    expect(regionRulesSchema.safeParse(value).success).toBe(false);
  });

  it("負の送料と小数を弾く", () => {
    expect(
      regionRulesSchema.safeParse({ version: 1, rules: [{ prefectures: ["01"], fee: -1 }] })
        .success,
    ).toBe(false);
    expect(
      regionRulesSchema.safeParse({ version: 1, rules: [{ prefectures: ["01"], fee: 900.5 }] })
        .success,
    ).toBe(false);
  });

  it("上限を超える送料を弾く", () => {
    expect(
      regionRulesSchema.safeParse({
        version: 1,
        rules: [{ prefectures: ["01"], fee: 100_001 }],
      }).success,
    ).toBe(false);
  });
});

describe("DB から読んだ値の受け取り", () => {
  it("形が壊れていれば地域別なしとして扱う", () => {
    // 0012 の検査制約を入れる前の行は既定値が {} だった。
    // ここで例外にすると、カート画面そのものが購入者に出せなくなる
    expect(parseRegionRules({})).toEqual(EMPTY_REGION_RULES);
    expect(parseRegionRules(null)).toEqual(EMPTY_REGION_RULES);
    expect(parseRegionRules("{}")).toEqual(EMPTY_REGION_RULES);
    expect(parseRegionRules({ version: 1, rules: "いろいろ" })).toEqual(EMPTY_REGION_RULES);
  });

  it("正しい形はそのまま読む", () => {
    const value = { version: 1, rules: [{ prefectures: ["47"], fee: 1500 }] };
    expect(parseRegionRules(value)).toEqual(value);
  });
});

describe("引き当て", () => {
  const okinawa = { version: 1 as const, rules: [{ prefectures: ["46", "47"], fee: 1500 }] };

  it("ルールに載っていればその金額", () => {
    expect(regionFee(okinawa, 800, "47")).toBe(1500);
    expect(regionFee(okinawa, 800, "46")).toBe(1500);
  });

  it("載っていなければ基本送料", () => {
    expect(regionFee(okinawa, 800, "13")).toBe(800);
  });

  it("地域別が無ければ常に基本送料", () => {
    for (const pref of PREFECTURES) {
      expect(regionFee(EMPTY_REGION_RULES, 800, pref.code)).toBe(800);
    }
  });
});

describe("範囲", () => {
  it("地域別が無ければ動かない", () => {
    expect(feeRange(EMPTY_REGION_RULES, 800)).toEqual({ min: 800, max: 800, varies: false });
  });

  it("基本送料も候補に入る", () => {
    const value = { version: 1 as const, rules: [{ prefectures: ["47"], fee: 1500 }] };
    expect(feeRange(value, 800)).toEqual({ min: 800, max: 1500, varies: true });
  });

  it("47 都道府県すべてが覆われていれば基本送料は候補から外れる", () => {
    // 入れてしまうと、誰も払わない金額が下限として表示される
    const value = {
      version: 1 as const,
      rules: [
        { prefectures: PREFECTURES.slice(0, 46).map((pref) => pref.code), fee: 1000 },
        { prefectures: ["47"], fee: 1500 },
      ],
    };
    expect(feeRange(value, 0)).toEqual({ min: 1000, max: 1500, varies: true });
  });

  it("全部同じ金額なら動かない", () => {
    const value = { version: 1 as const, rules: [{ prefectures: ["47"], fee: 800 }] };
    expect(feeRange(value, 800)).toEqual({ min: 800, max: 800, varies: false });
  });
});
