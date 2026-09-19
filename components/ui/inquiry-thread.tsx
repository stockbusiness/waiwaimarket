import {
  INQUIRY_SENDER_LABEL,
  type InquirySenderRole,
} from "@/lib/inquiries/status";

/**
 * やり取りの表示（0014）。購入者・テナント・本部の 3 面で同じものを使う。
 *
 * 見た目を面ごとに書き分けないのは、「誰の発言か」の対応がずれると
 * 争いの元になるため。自分側の発言に寄せた色を付けるので、どの面から
 * 見ているかだけを `viewer` で渡す。
 *
 * 本文は `whitespace-pre-wrap` でそのまま出す。HTML としては解釈しない
 * （React が文字列を描くので、`dangerouslySetInnerHTML` を使わない限り
 * タグは文字のまま出る。0009 の方針と同じ）。
 */

export type ThreadMessage = {
  id: string;
  senderRole: InquirySenderRole;
  body: string;
  createdAt: string;
};

const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export function InquiryThread({
  messages,
  viewer,
}: {
  messages: ThreadMessage[];
  /** この画面を見ている側。本部は監督なので、どちらにも寄せない */
  viewer: InquirySenderRole | "hq";
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted">まだやり取りがありません。</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => {
        const mine = message.senderRole === viewer;
        return (
          <li
            key={message.id}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-sm ${
              mine ? "border-accent/30 bg-surface" : "border-line bg-raised"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-bold">
                {INQUIRY_SENDER_LABEL[message.senderRole]}
              </span>
              <time dateTime={message.createdAt} className="text-xs text-subtle">
                {TIME_FORMAT.format(new Date(message.createdAt))}
              </time>
            </div>
            {/* `whitespace-pre-wrap` だけでは長い 1 語が折り返さない。
                URL を 1 本貼られただけで 390px の画面が横に伸びる
                （Chromium で実測。653px まで広がった）。`break-words` で
                語の途中でも折る */}
            <p className="leading-7 break-words whitespace-pre-wrap">{message.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
