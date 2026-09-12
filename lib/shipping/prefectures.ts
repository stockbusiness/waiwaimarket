/**
 * 都道府県（JIS X 0401 の 2 桁コード）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * **コードで持ち、名前で持たない。** 「北海道」と「北海道 」、「大阪府」と
 * 「大阪」のような表記ゆれが起きると、地域別送料の突き合わせが静かに外れて
 * 基本送料になる。金額が変わるので、ゆれる可能性のあるものを鍵にしない。
 *
 * **地域区分（北海道・東北・関東…）にしない。** 区分の切り方が配送業者ごとに
 * 違うため、どの業者にも合わない箱になる。都道府県なら全業者で共通で、
 * 業者側の地域表から機械的に写せる。
 */

/** コード順（JIS X 0401）。画面の並びもこれに従う */
export const PREFECTURES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "01", name: "北海道" },
  { code: "02", name: "青森県" },
  { code: "03", name: "岩手県" },
  { code: "04", name: "宮城県" },
  { code: "05", name: "秋田県" },
  { code: "06", name: "山形県" },
  { code: "07", name: "福島県" },
  { code: "08", name: "茨城県" },
  { code: "09", name: "栃木県" },
  { code: "10", name: "群馬県" },
  { code: "11", name: "埼玉県" },
  { code: "12", name: "千葉県" },
  { code: "13", name: "東京都" },
  { code: "14", name: "神奈川県" },
  { code: "15", name: "新潟県" },
  { code: "16", name: "富山県" },
  { code: "17", name: "石川県" },
  { code: "18", name: "福井県" },
  { code: "19", name: "山梨県" },
  { code: "20", name: "長野県" },
  { code: "21", name: "岐阜県" },
  { code: "22", name: "静岡県" },
  { code: "23", name: "愛知県" },
  { code: "24", name: "三重県" },
  { code: "25", name: "滋賀県" },
  { code: "26", name: "京都府" },
  { code: "27", name: "大阪府" },
  { code: "28", name: "兵庫県" },
  { code: "29", name: "奈良県" },
  { code: "30", name: "和歌山県" },
  { code: "31", name: "鳥取県" },
  { code: "32", name: "島根県" },
  { code: "33", name: "岡山県" },
  { code: "34", name: "広島県" },
  { code: "35", name: "山口県" },
  { code: "36", name: "徳島県" },
  { code: "37", name: "香川県" },
  { code: "38", name: "愛媛県" },
  { code: "39", name: "高知県" },
  { code: "40", name: "福岡県" },
  { code: "41", name: "佐賀県" },
  { code: "42", name: "長崎県" },
  { code: "43", name: "熊本県" },
  { code: "44", name: "大分県" },
  { code: "45", name: "宮崎県" },
  { code: "46", name: "鹿児島県" },
  { code: "47", name: "沖縄県" },
];

export const PREFECTURE_COUNT = PREFECTURES.length;

const NAME_BY_CODE = new Map(PREFECTURES.map((pref) => [pref.code, pref.name]));

export function isPrefectureCode(value: unknown): value is string {
  return typeof value === "string" && NAME_BY_CODE.has(value);
}

/** 未知のコードは null。画面で「（不明）」と出すか、行ごと落とすかは呼び出し側が決める */
export function prefectureName(code: string): string | null {
  return NAME_BY_CODE.get(code) ?? null;
}
