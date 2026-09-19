/**
 * 注文番号（docs/00 12章「管理画面、決済、注文番号、問い合わせ窓口、
 * 利用規約を分ける」）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 形は `WM-20260919-K7P2NX`（2026-09-19 決定）。
 *
 * **連番にしない。** `WM-000001` のような番号は、注文数が外から推測できる。
 * 購入者が自分の番号を見れば「このマーケットの累計注文数」が分かってしまう。
 *
 * **日付を入れる。** 問い合わせで「いつの注文か」を口頭で照合しやすい。
 * 日付は JST。購入者が見る日付と番号の日付がずれると、照合の役に立たない。
 */

/**
 * 番号に使う文字。
 *
 * **紛らわしい文字を外してある。** `0`/`O`、`1`/`I`/`L` は、電話口で
 * 読み上げたり手で書き写したりするときに取り違える。31 文字あるので、
 * 6 桁で約 8.9 億通り（1 日あたり）。
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const RANDOM_LENGTH = 6;

/**
 * 棄却の境目。`floor(256 / 31) * 31 = 248`。
 *
 * **`% ALPHABET.length` だけで丸めない。** 31 は 256 を割り切らないため、
 * 248〜255 の 8 通りが先頭の 8 文字（`2`〜`9`）に余分に割り当たり、
 * その 8 文字だけ約 3% 出やすくなる。偏った番号は推測の手がかりになる。
 * 境目以上のバイトは捨てて引き直す。
 */
const REJECT_AT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/** 先頭の識別子。NFT 側の番号と混ざらないようにする（docs/00 12章） */
const PREFIX = "WM";

/** `20260919`。JST で出す */
function jstDatePart(now: Date): string {
  // UTC の時刻に 9 時間足してから UTC として読むと JST の日付になる。
  // `toLocaleDateString` は実行環境のロケール実装に依存するので使わない
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * ランダム部分。
 *
 * **`Math.random()` を使わない。** 推測できると、他人の注文番号を当てて
 * 問い合わせ窓口で使われる余地が出る。暗号用の乱数を使う。
 *
 * 棄却法。`REJECT_AT` 以上のバイトは捨てて引き直すので、どの文字も
 * 同じ確率で出る。捨てる割合は 8/256（約 3%）なので、引き直しは
 * ほとんど起きない。
 */
function randomPart(randomBytes: (size: number) => Uint8Array): string {
  let out = "";
  while (out.length < RANDOM_LENGTH) {
    // 足りないぶんより多めに引く。1 バイトずつ引くと呼び出し回数が増える
    for (const byte of randomBytes(RANDOM_LENGTH)) {
      if (byte >= REJECT_AT) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === RANDOM_LENGTH) break;
    }
  }
  return out;
}

function defaultRandomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

/**
 * 注文番号を 1 つ作る。
 *
 * **一意性はここでは保証しない。** `orders.order_number` の一意制約
 * （0001）が最後の砦で、衝突したら呼び出し側が引き直す
 * （lib/orders/create.ts）。10.7 億分の 1 なので実際にはまず起きないが、
 * 「起きない前提」で一意制約を外さないこと。
 */
export function generateOrderNumber(
  now: Date = new Date(),
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes,
): string {
  return `${PREFIX}-${jstDatePart(now)}-${randomPart(randomBytes)}`;
}

/** 表示や検索に使う前の形式確認 */
export function isOrderNumber(value: string): boolean {
  return new RegExp(`^${PREFIX}-\\d{8}-[${ALPHABET}]{${RANDOM_LENGTH}}$`).test(value);
}
