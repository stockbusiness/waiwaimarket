import type { PointEntryType, PointLotStatus } from "@/lib/supabase/database.types";

/**
 * ポイントの表示名（docs/02 6.2）。
 *
 * IO を持たないので `server-only` を付けない。
 *
 * **台帳の enum をそのまま画面に出さない。** `earn_pending` と出しても
 * 購入者には伝わらない。画面に出す文字は日本語にする（CLAUDE.md）。
 */

export const ENTRY_TYPE_LABEL: Record<PointEntryType, string> = {
  earn_pending: "獲得（確定待ち）",
  earn_confirmed: "獲得の確定",
  spend: "利用",
  spend_refund: "返品による返還",
  earn_reversal: "獲得の取り消し",
  expire: "有効期限切れ",
  adjustment: "調整",
};

export const LOT_STATUS_LABEL: Record<PointLotStatus, string> = {
  pending: "確定待ち",
  available: "利用可能",
  exhausted: "使い切り",
  expired: "期限切れ",
  reversed: "取り消し済み",
};

const NUMBER = new Intl.NumberFormat("ja-JP");

/** 「1,200 ポイント」。単位は日本語で出す */
export function formatPoints(value: number): string {
  return `${NUMBER.format(value)} ポイント`;
}

/**
 * 増減を符号付きで出す。
 *
 * **0 に符号を付けない。** 取り消しの差引が 0 になる行で「+0」と出ると、
 * 何かが増えたように読める。
 */
export function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${NUMBER.format(Math.abs(delta))}`;
}

/**
 * 万分率を「％」で出す。`100 → "1%"`、`5000 → "50%"`、`25 → "0.25%"`。
 *
 * **割り算の結果をそのまま出さない。** `100 / 10000` は `0.01` だが、
 * `0.0003` のような値では `Number` の表示が指数表記になりうる。
 * 整数のまま桁を組み立てる。
 */
export function formatBasisPoints(basisPoints: number): string {
  return `${basisPointsToPercentText(basisPoints)}%`;
}

/**
 * 万分率を「％」抜きの文字にする。`100 → "1"`、`25 → "0.25"`。
 *
 * 入力欄の既定値に使う。`formatBasisPoints()` の「％」を画面側で削ると、
 * 記号を変えたときに削り漏れる。
 */
export function basisPointsToPercentText(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
