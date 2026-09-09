#!/usr/bin/env node
/**
 * 最初の本部管理者を hq_members へ登録する。
 *
 * 0007 で本部ロールの唯一の正を hq_members にしたため、テーブルが空の間は
 * 誰も is_hq_admin() を満たせない。最初の 1 人だけはこのスクリプトで入れる。
 * 2 人目以降は管理画面から追加できる。
 *
 *   node scripts/bootstrap-hq-admin.mjs <email> "<表示名>" [hq_admin|hq_operator]
 *
 * 必要な環境変数（.env.local か export で渡す）
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 対象の利用者は、先に本部ログイン画面（/admin/login）からメール認証を
 * 済ませておくこと。auth.users に行が無いと user_id を特定できない。
 */
import { createClient } from "@supabase/supabase-js";

const [email, displayName, roleArg] = process.argv.slice(2);
const role = roleArg ?? "hq_admin";

function fail(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

if (!email || !displayName) {
  fail(
    ' 使い方: node scripts/bootstrap-hq-admin.mjs <email> "<表示名>" [hq_admin|hq_operator]',
  );
}
if (role !== "hq_admin" && role !== "hq_operator") {
  fail("role は hq_admin か hq_operator のいずれかです");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  fail("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** auth.users からメールアドレスで利用者を探す */
async function findUserByEmail(target) {
  const needle = target.trim().toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`利用者の取得に失敗しました: ${error.message}`);
    const hit = data.users.find((user) => user.email?.toLowerCase() === needle);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  fail(
    `${email} の利用者が見つかりません。先に /admin/login からメール認証を済ませてください。`,
  );
}

const { error } = await supabase
  .from("hq_members")
  .upsert(
    { user_id: user.id, role, display_name: displayName, is_active: true },
    { onConflict: "user_id" },
  );

if (error) fail(`hq_members への登録に失敗しました: ${error.message}`);

console.log(`登録しました: ${email} / ${displayName} / ${role} (user_id=${user.id})`);
console.log(
  role === "hq_admin"
    ? "本部管理者の操作には多要素認証が必要です（AAL2）。MFA の登録画面は未実装のため、\n" +
        "現時点では停止・停止解除は行えません。審査・承認・差戻しは利用できます。"
    : "",
);
