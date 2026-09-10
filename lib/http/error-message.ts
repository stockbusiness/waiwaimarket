/**
 * API のエラー応答を利用者向けの文言へ変換する（クライアント側で使う）。
 *
 * 以前は 422 と 500 を同じ文言で出していたため、サーバーの設定不足を
 * 「入力内容をご確認ください」と表示してしまい、原因の切り分けができなかった。
 * 判別できない場合でも HTTP ステータスを添えて、問い合わせで特定できるようにする。
 */
export type ApiErrorBody = {
  error?: {
    reason?: string;
    /** 設定エラーのとき、足りない環境変数の名前。値は含まない */
    variable?: string;
    /** DB エラーのとき、PostgreSQL のエラーコード（例 42501） */
    code?: string;
  };
};

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  const reason = body?.error?.reason;

  switch (reason) {
    case "configuration":
      return `サーバーの設定が未完了です（${body?.error?.variable ?? "環境変数"}）。管理者にご連絡ください。`;
    case "invalid_input":
      return "入力内容に誤りがあります。各項目をご確認ください。";
    case "already_belongs_to_tenant":
      return "すでに別のテナントに所属しています。";
    case "slug_taken":
      return "その店舗 URL はすでに使われています。";
    case "not_found":
      return "対象が見つかりませんでした。";
    case "invalid_transition":
      return "現在の状態では実行できない操作です。";
    case "unauthenticated":
      return "ログインの有効期限が切れています。再度ログインしてください。";
    case "mfa_required":
      return "この操作には多要素認証が必要です。";
    case "forbidden":
      return "この操作を行う権限がありません。";
    default: {
      const code = body?.error?.code;
      return code
        ? `${fallback}（HTTP ${response.status} / コード ${code}）`
        : `${fallback}（HTTP ${response.status}）`;
    }
  }
}
