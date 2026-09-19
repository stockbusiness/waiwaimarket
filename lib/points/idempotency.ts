/**
 * 台帳の処理キー（docs/02 6.5）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 「すべての付与・利用・取消に一意な処理キーを持たせる」
 * 「order_item_id + event_type + sequence 等で重複を拒否する」
 *
 * この文字列が `point_ledger_entries.idempotency_key` の unique 制約に
 * 当たることで、同じ通知が複数回届いても二重付与にならない。**重複の拒否は
 * DB に任せる。** アプリ側で「既にあるか読んで、無ければ書く」と書くと、
 * その隙間で二重に入る。
 */

/** docs/02 6.2 の entry_type。0001 の point_entry_type と対にする */
export type LedgerEntryType =
  | "earn_pending"
  | "earn_confirmed"
  | "spend"
  | "spend_refund"
  | "earn_reversal"
  | "expire"
  | "adjustment";

export type LedgerKeyParts = {
  /** 注文明細に紐づく行（付与・利用・取消） */
  orderItemId?: string;
  /** 明細に紐づかない行（失効など）はロットで作る */
  lotId?: string;
  entryType: LedgerEntryType;
  /** 同じ対象・同じ種別で複数立つ場合の連番。1 から */
  sequence: number;
};

/**
 * **区切り文字を値に含めない。**
 *
 * 素直に連結すると `"a:b" + ":" + "c"` と `"a" + ":" + "b:c"` が同じ文字列に
 * なる。uuid なら `:` は現れないが、キーの作り方として塞いでおく。
 */
function escape(value: string): string {
  return encodeURIComponent(value);
}

export function ledgerKey(parts: LedgerKeyParts): string {
  if (!Number.isInteger(parts.sequence) || parts.sequence < 1) {
    throw new Error(`連番は 1 以上の整数です: ${parts.sequence}`);
  }

  // どちらを軸にしたキーかを先頭に置く。注文明細とロットで id 空間が
  // 別なので、混ざらないようにする
  if (parts.orderItemId) {
    return `item:${escape(parts.orderItemId)}:${parts.entryType}:${parts.sequence}`;
  }
  if (parts.lotId) {
    return `lot:${escape(parts.lotId)}:${parts.entryType}:${parts.sequence}`;
  }

  throw new Error("orderItemId か lotId のどちらかが要ります");
}
