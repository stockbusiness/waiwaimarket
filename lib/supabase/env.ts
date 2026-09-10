/**
 * 環境変数の読み出し。
 *
 * このファイルはクライアントからも読まれるため、NEXT_PUBLIC_ が付いた値だけを扱う。
 * サービスロールキーの読み出しは lib/supabase/service.ts に閉じている。
 */

/**
 * 設定不足を表す例外。通常のエラーと区別できるようにする。
 *
 * これを個別に扱えないと、環境変数が 1 つ欠けているだけで
 * 「Internal Server Error」や「入力内容をご確認ください」になり、
 * ログを見に行くまで原因が分からない。実際にそれで詰まった。
 */
export class ConfigurationError extends Error {
  readonly variableName: string;

  /**
   * @param detail 未設定以外の理由。値そのものは絶対に渡さない（ログに残る）。
   */
  constructor(variableName: string, detail?: string) {
    super(
      detail ??
        `環境変数 ${variableName} が未設定です。.env.example を参照して設定してください。`,
    );
    this.name = "ConfigurationError";
    this.variableName = variableName;
  }
}

/**
 * HTTP ヘッダに載せられない文字を含む位置（0 始まり）を返す。無ければ -1。
 *
 * Node は Authorization などのヘッダ値に印字可能 ASCII 以外が入ると
 * `ERR_INVALID_CHAR` を投げる。これは送信前に落ちるため、SDK の層では
 * 「接続エラー」に化けて原因が見えなくなる。実際に Stripe の
 * `Invalid character in header content ["Authorization"]` で詰まった。
 */
function findUnsafeHeaderCharIndex(value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return i;
  }
  return -1;
}

/**
 * 環境変数を必須として読み出す。すべての環境変数はここを通る。
 *
 * 前後の空白と改行は落とす。キーや URL の前後の空白に意味はなく、
 * 管理画面へ貼り付けるときに紛れ込むほうがはるかに多い。
 * 落としたあとに使えない文字が残っていれば設定エラーとして扱う。
 *
 * メッセージに値そのものを含めてはならない（ログに残る）。
 */
export function required(name: string, value: string | undefined): string {
  if (!value) throw new ConfigurationError(name);

  const trimmed = value.trim();
  if (!trimmed) throw new ConfigurationError(name);

  const unsafeIndex = findUnsafeHeaderCharIndex(trimmed);
  if (unsafeIndex >= 0) {
    const code = trimmed.charCodeAt(unsafeIndex);
    const kind = code < 0x20 || code === 0x7f ? "制御文字（改行など）" : "ASCII 以外の文字";
    throw new ConfigurationError(
      name,
      `環境変数 ${name} の値に ${kind} が含まれています（${unsafeIndex + 1} 文字目）。` +
        `値を貼り直して、改行や全角文字が混ざっていないか確認してください。`,
    );
  }

  return trimmed;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
