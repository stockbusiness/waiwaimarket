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

export function required(name: string, value: string | undefined): string {
  if (!value) throw new ConfigurationError(name);
  return value;
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
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
