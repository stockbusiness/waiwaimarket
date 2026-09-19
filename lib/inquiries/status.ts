/**
 * 問い合わせの状態と、誰が何をできるか（docs/00 5.1・5.3、docs/06 フェーズ5-4）。
 *
 * IO を持たないので `server-only` を付けない（単体テストのため）。
 *
 * 判定をここへ集めるのは、画面（ボタンを出すか）と API（受け付けるか）で
 * 同じ答えを返させるため。別々に書くと、画面には出ないのに API は通る、
 * という穴ができる。DB 側でも 0014 のポリシーが同じ条件
 * （`status <> 'closed'`）を持っていて、三重になる。
 */

export const INQUIRY_STATUSES = ["open", "answered", "closed"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_SENDER_ROLES = ["buyer", "tenant"] as const;
export type InquirySenderRole = (typeof INQUIRY_SENDER_ROLES)[number];

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  open: "未回答",
  answered: "回答済み",
  closed: "完了",
};

export const INQUIRY_SENDER_LABEL: Record<InquirySenderRole, string> = {
  buyer: "お客様",
  tenant: "お店",
};

export function isInquiryStatus(value: string): value is InquiryStatus {
  return (INQUIRY_STATUSES as readonly string[]).includes(value);
}

/**
 * 発言を足せるか。
 *
 * 完了にしたスレッドは両者とも書けない。続きがあるなら新しく立ててもらう。
 * 完了後も書けるようにすると、テナントが「終わった」と思っている場所に
 * 質問が積もり、誰も見ないまま放置される。
 */
export function canPostMessage(status: InquiryStatus): boolean {
  return status !== "closed";
}

/**
 * 発言が入ったあとの状態。
 *
 * **誰が最後に話したかで決まる。** テナントが答えれば「回答済み」、購入者が
 * 追記すれば「未回答」へ戻る。テナントの一覧は未回答を上に出すので、
 * 追加の質問が回答済みに埋もれない。
 *
 * 完了は動かさない。0014 の `inquiry_touch_thread()` と同じ規則で、
 * こちらは画面に出す予測値（DB を待たずに描けるように）。
 */
export function statusAfterMessage(
  status: InquiryStatus,
  sender: InquirySenderRole,
): InquiryStatus {
  if (status === "closed") return "closed";
  return sender === "tenant" ? "answered" : "open";
}

/**
 * 完了にできるか。閉じるのはテナントだけ（docs/06 フェーズ5-4）。
 *
 * 購入者に閉じさせないのは、返答の要否を判断するのが店側のため。
 * 購入者が返信をやめればそのまま放置されるが、一覧では未回答として
 * 残り続けるので、店側が気づいて閉じられる。
 */
export function canCloseInquiry(status: InquiryStatus): boolean {
  return status !== "closed";
}

/** 完了を取り消して再開できるか。取り違えて閉じたときの戻り道 */
export function canReopenInquiry(status: InquiryStatus): boolean {
  return status === "closed";
}

/** 発言の上限（0014 の検査制約と同じ値。片方だけ変えないこと） */
export const MAX_MESSAGE_LENGTH = 2000;
