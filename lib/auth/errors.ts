/** 認可の失敗を表す。API では HTTP へ、画面ではリダイレクトへ変換する */
export type AuthFailureReason =
  | "unauthenticated"
  | "forbidden"
  | "mfa_required";

export class AuthorizationError extends Error {
  readonly reason: AuthFailureReason;

  constructor(reason: AuthFailureReason, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.reason = reason;
  }
}

export function unauthenticated(message = "ログインが必要です"): AuthorizationError {
  return new AuthorizationError("unauthenticated", message);
}

export function forbidden(message = "この操作を行う権限がありません"): AuthorizationError {
  return new AuthorizationError("forbidden", message);
}

export function mfaRequired(
  message = "多要素認証が必要です",
): AuthorizationError {
  return new AuthorizationError("mfa_required", message);
}

export function statusForReason(reason: AuthFailureReason): number {
  switch (reason) {
    case "unauthenticated":
      return 401;
    case "mfa_required":
      return 403;
    case "forbidden":
      return 403;
  }
}

/** Route Handler で AuthorizationError を JSON レスポンスへ変換する */
export function authErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AuthorizationError)) return null;
  return Response.json(
    { error: { reason: error.reason, message: error.message } },
    { status: statusForReason(error.reason) },
  );
}
