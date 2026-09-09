import "server-only";

import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 本部管理者の多要素認証（docs/00 8.2）。
 *
 * Supabase は認証の強度を AAL で表し、TOTP を検証済みのセッションは aal2 になる。
 * 登録と検証はブラウザ側で行う（新しいセッションが発行されるため）。
 * ここではサーバー側から状態を読むだけ。
 */

export type MfaStatus = {
  /** 検証済みの TOTP 要素を持っているか */
  hasVerifiedFactor: boolean;
  /** 現在のセッションの強度 */
  currentLevel: string | null;
  /** 到達しうる強度。currentLevel より高ければ MFA を通す余地がある */
  nextLevel: string | null;
};

export async function getMfaStatus(
  client: MarketSupabaseClient,
): Promise<MfaStatus> {
  const [factors, assurance] = await Promise.all([
    client.auth.mfa.listFactors(),
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const hasVerifiedFactor = (factors.data?.all ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );

  return {
    hasVerifiedFactor,
    currentLevel: assurance.data?.currentLevel ?? null,
    nextLevel: assurance.data?.nextLevel ?? null,
  };
}
