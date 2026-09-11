import type { NextRequest } from "next/server";

import { checkCronAuth } from "@/lib/http/cron-auth";
import { apiErrorResponse } from "@/lib/http/errors";
import { releaseExpiredReservations } from "@/lib/inventory/reserve";

/**
 * 期限切れの在庫引当を解放するバッチ（docs/06 4.2「期限切れの引当は
 * 自動解放する」）。Vercel Cron から呼ぶ。
 *
 * 経路が `/api/cron/...` なのは、購入者面の cookie（path `/`）の配下で
 * よいため。Cron はそもそも cookie を送らず、`Authorization: Bearer` の
 * 秘密鍵だけが入口の守りになる。
 *
 * **このバッチが遅れても売り過ぎは起きない。** 引当の直前に、その SKU の
 * 期限切れをその場で解放しているため（0011）。ここは後片付けであって、
 * 正しさの担保ではない。
 *
 * 冪等。二重に実行しても 2 回目は 0 件になる（CLAUDE.md 全般ルール）。
 */
export async function POST(request: NextRequest) {
  return run(request);
}

/**
 * Vercel Cron は GET で呼ぶ。手で叩くときのために POST も受ける。
 * 読み取りではないが、Cron の仕様に合わせる。
 */
export async function GET(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest): Promise<Response> {
  try {
    const auth = checkCronAuth(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    );

    if (auth === "not_configured") {
      // 設定漏れを 401 で返すと、鍵が違うのか未設定なのか分からない。
      // 503 と変数名で区別できるようにする（lib/http/errors.ts と同じ方針）
      console.error("引当解放バッチ: CRON_SECRET が未設定です");
      return Response.json(
        { error: { reason: "configuration", variable: "CRON_SECRET" } },
        { status: 503 },
      );
    }
    if (auth === "unauthorized") {
      return Response.json({ error: { reason: "unauthenticated" } }, { status: 401 });
    }

    const released = await releaseExpiredReservations();
    // 件数をログに残す。0 が続くのは正常だが、常に大きい値が出るなら
    // 購入手続きの離脱が多いということなので、運用で気づけるようにする
    console.info("引当解放バッチ", { released });

    return Response.json({ released });
  } catch (error) {
    return apiErrorResponse(error, "引当の解放に失敗しました");
  }
}
