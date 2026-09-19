import { isPrefectureCode, prefectureName } from "@/lib/shipping/prefectures";

/**
 * 配送先住所（docs/00 5.1「配送先登録」）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * **都道府県はコードで持つ。** 地域別送料（lib/shipping/region.ts）と同じ
 * JIS X 0401 の 2 桁。名前で持つと「大阪府」「大阪」の表記ゆれで送料の
 * 突き合わせが静かに外れ、金額が変わる。
 *
 * **注文には写し取る。** `orders.shipping_address` は `buyer_addresses` への
 * 外部キーにしない。購入者が後から住所を直したり消したりしても、
 * 「どこへ送った注文か」が変わってはいけない。`region_rules` と同じく
 * `version` を持たせ、0013 の検査制約で形を守る。
 */

export const SHIPPING_ADDRESS_VERSION = 1;

export type Address = {
  /** 宛名。姓名を分けない（海外表記や屋号を弾かないため） */
  recipientName: string;
  phone: string;
  /** ハイフン無しの 7 桁 */
  postalCode: string;
  /** JIS X 0401 の 2 桁 */
  prefectureCode: string;
  city: string;
  addressLine1: string;
  /** 建物名・部屋番号。無くてよい */
  addressLine2: string | null;
};

/** 注文に写し取る形。`version` は後から形を変えたときに読み分けるため */
export type ShippingAddressSnapshot = Address & { version: number };

export const MAX_LENGTHS = {
  recipientName: 60,
  city: 60,
  addressLine1: 100,
  addressLine2: 100,
} as const;

/**
 * 全角の数字・ハイフンを半角に直す。
 *
 * スマートフォンの日本語入力では全角のまま確定されることが多い。
 * 弾くのではなく直す（利用者に打ち直させる理由が無い）。
 *
 * 長音符・ダッシュ類もハイフンとして扱う。見た目が同じで区別できない。
 */
function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー−–—―‐­~〜]/g, "-");
}

/**
 * 郵便番号を 7 桁の数字に正規化する。形が違えば null。
 *
 * `123-4567`、`1234567`、`１２３ー４５６７` をすべて `1234567` にする。
 * 保存はハイフン無しで統一し、表示するときに入れる。両方を許すと
 * 同じ住所が 2 通りの文字列で保存され、突き合わせができなくなる。
 */
export function normalizePostalCode(raw: string): string | null {
  const digits = toHalfWidth(raw).replace(/[\s-]/g, "");
  return /^\d{7}$/.test(digits) ? digits : null;
}

/** 表示用。`1234567` → `123-4567` */
export function formatPostalCode(postalCode: string): string {
  return `${postalCode.slice(0, 3)}-${postalCode.slice(3)}`;
}

/**
 * 電話番号を数字だけに正規化する。形が違えば null。
 *
 * 10 桁または 11 桁を受ける（固定電話と携帯）。国番号付き（+81）は
 * 先頭の 0 を補って国内表記に直す。
 */
export function normalizePhone(raw: string): string | null {
  let digits = toHalfWidth(raw).replace(/[\s()-]/g, "");

  if (digits.startsWith("+81")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("81") && digits.length >= 11) digits = `0${digits.slice(2)}`;

  return /^0\d{9,10}$/.test(digits) ? digits : null;
}

/** 表示用。番号の区切りは市外局番の桁数で変わるため、ここでは分割しない */
export function formatPhone(phone: string): string {
  return phone;
}

/**
 * 1 行の文字列にする。注文確認やメールで使う。
 *
 * 都道府県は表示のときだけ名前に直す。コードのまま見せない。
 */
export function formatAddress(address: Address): string {
  const parts = [
    `〒${formatPostalCode(address.postalCode)}`,
    prefectureName(address.prefectureCode) ?? "",
    address.city,
    address.addressLine1,
    address.addressLine2 ?? "",
  ];
  return parts.filter((part) => part !== "").join(" ");
}

/**
 * 注文へ写し取る形にする。
 *
 * 保存済みの行をそのまま渡す前提なので、ここでは検証しない
 * （検証は保存時の zod と 0013 の検査制約が済ませている）。
 */
export function toSnapshot(address: Address): ShippingAddressSnapshot {
  return { version: SHIPPING_ADDRESS_VERSION, ...address };
}

/**
 * DB から読んだ jsonb を形に落とす。読めなければ null。
 *
 * 形の担保は 0013 の検査制約が持っていて、ここは最後の受け皿。
 * 注文画面が例外で落ちるより、「住所を表示できません」と出すほうがよい。
 */
export function parseSnapshot(value: unknown): ShippingAddressSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;

  const text = (key: string, max: number): string | null => {
    const raw = v[key];
    return typeof raw === "string" && raw.trim() !== "" && raw.length <= max
      ? raw
      : null;
  };

  const recipientName = text("recipientName", MAX_LENGTHS.recipientName);
  const city = text("city", MAX_LENGTHS.city);
  const addressLine1 = text("addressLine1", MAX_LENGTHS.addressLine1);
  const postalCode = typeof v.postalCode === "string" ? v.postalCode : "";
  const phone = typeof v.phone === "string" ? v.phone : "";
  const prefectureCode = v.prefectureCode;

  if (v.version !== SHIPPING_ADDRESS_VERSION) return null;
  if (!recipientName || !city || !addressLine1) return null;
  if (!/^\d{7}$/.test(postalCode) || !/^0\d{9,10}$/.test(phone)) return null;
  if (!isPrefectureCode(prefectureCode)) return null;

  const line2 = v.addressLine2;
  return {
    version: SHIPPING_ADDRESS_VERSION,
    recipientName,
    phone,
    postalCode,
    prefectureCode,
    city,
    addressLine1,
    addressLine2:
      typeof line2 === "string" && line2.trim() !== "" && line2.length <= MAX_LENGTHS.addressLine2
        ? line2
        : null,
  };
}
