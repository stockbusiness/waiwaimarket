"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Enrollment = {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
};

/**
 * TOTP の登録と検証（docs/00 8.2「本部管理者には多要素認証を必須とする」）。
 *
 * 登録・検証はブラウザ側で行う。検証に成功すると新しいセッション（aal2）が
 * 発行され、cookie も更新されるため、サーバー側からは扱えない。
 */
export function MfaEnrollment({ alreadyVerified }: { alreadyVerified: boolean }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 登録済みなら、いまのセッションを aal2 へ引き上げるだけでよい
  const mode = alreadyVerified ? "challenge" : "enroll";

  useEffect(() => {
    if (mode !== "enroll" || enrollment) return;

    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient("hq");
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `waiwaimarket-${new Date().toISOString().slice(0, 10)}`,
      });
      if (cancelled) return;
      if (enrollError || !data) {
        setError(enrollError?.message ?? "認証アプリの登録を開始できませんでした");
        return;
      }
      setEnrollment({
        factorId: data.id,
        qrCodeSvg: data.totp.qr_code,
        secret: data.totp.secret,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, enrollment]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createSupabaseBrowserClient("hq");

    let factorId = enrollment?.factorId;
    if (!factorId) {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        setBusy(false);
        return;
      }
      factorId = data?.all.find(
        (factor) => factor.factor_type === "totp" && factor.status === "verified",
      )?.id;
    }

    if (!factorId) {
      setError("認証アプリが登録されていません");
      setBusy(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.message);
      setBusy(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === "enroll" ? (
        enrollment ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-6">
              認証アプリで次の QR コードを読み取ってください。
            </p>
            {/* qr_code は SVG の文字列。data URL にして画像として描画する。
                data URI なので next/image の最適化は効かず、外部読み込みも無い。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCodeSvg)}`}
              alt="認証アプリ登録用の QR コード"
              width={180}
              height={180}
              /* QR は黒い図形のみで背景が透明なため、暗い面の上では読み取れない。
                 ここだけはテーマに関わらず白地を敷く。 */
              className="rounded border border-line bg-white p-2"
            />
            <details className="text-sm">
              <summary className="cursor-pointer">QR コードを読み取れない場合</summary>
              <p className="mt-2 break-all font-mono text-xs">{enrollment.secret}</p>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted">登録の準備をしています…</p>
        )
      ) : (
        <p className="text-sm leading-6">
          登録済みの認証アプリに表示されている 6 桁の数字を入力してください。
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="確認コード" required>
          <TextInput
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            required
            className="w-40 font-mono"
          />
        </Field>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button
          type="submit"
          disabled={busy || (mode === "enroll" && !enrollment)}
          className="w-fit"
        >
          {busy ? "確認中…" : "確認する"}
        </Button>
      </form>
    </div>
  );
}
