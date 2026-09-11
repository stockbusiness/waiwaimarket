#!/usr/bin/env node
/**
 * デプロイ後の疎通確認。認証情報は要らない。
 *
 *   node scripts/smoke-check.mjs https://<デプロイ先>
 *
 * 未ログインで確かめられる範囲だけを見る。
 *   - 公開画面が開くこと
 *   - proxy.ts がテナント画面・本部画面を閉めていること
 *   - API が未認証を 401 で弾くこと（RLS 任せにしていないこと）
 *   - Stripe Webhook が署名なしを 400 で弾くこと
 *
 * ここが通っても「申請から承認までの通し動作」は確認できない。
 * それはメール認証と Stripe の実操作が要るので手作業で行う。
 */

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("使い方: node scripts/smoke-check.mjs https://<デプロイ先>");
  process.exit(1);
}

/** @type {{name: string, run: () => Promise<{ok: boolean, detail: string}>}[]} */
const checks = [
  {
    name: "トップページが開く",
    run: async () => {
      const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "購入者ログイン画面が開く",
    run: async () => {
      const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "未ログインで /tenant はログイン画面へ飛ぶ",
    run: async () => {
      const res = await fetch(`${baseUrl}/tenant`, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      return {
        ok: res.status >= 300 && res.status < 400 && location.includes("/tenant/login"),
        detail: `HTTP ${res.status} → ${location || "(なし)"}`,
      };
    },
  },
  {
    name: "未ログインで /admin はログイン画面へ飛ぶ",
    run: async () => {
      const res = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      return {
        ok: res.status >= 300 && res.status < 400 && location.includes("/admin/login"),
        detail: `HTTP ${res.status} → ${location || "(なし)"}`,
      };
    },
  },
  {
    name: "出店申請 API が未認証を 401 で弾く",
    run: async () => {
      const res = await fetch(`${baseUrl}/tenant/api/application`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        redirect: "manual",
      });
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "テナント審査 API が未認証を 401 で弾く",
    run: async () => {
      const res = await fetch(
        `${baseUrl}/admin/api/tenants/00000000-0000-4000-8000-000000000000/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
          redirect: "manual",
        },
      );
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "Stripe Webhook が署名なしを 400 で弾く",
    run: async () => {
      const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        redirect: "manual",
      });
      return { ok: res.status === 400, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "商品一覧が開く",
    run: async () => {
      const res = await fetch(`${baseUrl}/products`, { redirect: "manual" });
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "商品一覧の絞り込みが 500 にならない",
    run: async () => {
      // 存在しないカテゴリー・記号入りの検索語・範囲外のページ番号を同時に渡す。
      // 0 件になるのが正しく、落ちてはいけない
      const res = await fetch(
        `${baseUrl}/products?category=no-such-category&q=%25&page=9999`,
        { redirect: "manual" },
      );
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "存在しない店舗ページが 404 を返す",
    run: async () => {
      const res = await fetch(`${baseUrl}/stores/no-such-store-xyz`, { redirect: "manual" });
      return { ok: res.status === 404, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "存在しないサイトページが 404 を返す",
    run: async () => {
      const res = await fetch(`${baseUrl}/legal/no-such-page-xyz`, { redirect: "manual" });
      return { ok: res.status === 404, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "サイトページ API が未認証を 401 で弾く",
    run: async () => {
      const res = await fetch(`${baseUrl}/admin/api/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        redirect: "manual",
      });
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "商品 API が未認証を 401 で弾く",
    run: async () => {
      const res = await fetch(`${baseUrl}/tenant/api/products`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "00000000-0000-4000-8000-000000000000" }),
        redirect: "manual",
      });
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "商品審査 API が未認証を 401 で弾く",
    run: async () => {
      const res = await fetch(
        `${baseUrl}/admin/api/products/00000000-0000-4000-8000-000000000000/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
          redirect: "manual",
        },
      );
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    },
  },
  {
    name: "未ログインで /admin/mfa はログイン画面へ飛ぶ",
    run: async () => {
      const res = await fetch(`${baseUrl}/admin/mfa`, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      return {
        ok: res.status >= 300 && res.status < 400 && location.includes("/admin/login"),
        detail: `HTTP ${res.status} → ${location || "(なし)"}`,
      };
    },
  },
  {
    name: "サービスロールキーが配信物に含まれない",
    run: async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();
      const leaked = /service_role|SUPABASE_SERVICE_ROLE_KEY|sk_(test|live)_/.test(html);
      return { ok: !leaked, detail: leaked ? "★ HTML に痕跡あり" : "痕跡なし" };
    },
  },
];

let failed = 0;

for (const check of checks) {
  try {
    const result = await check.run();
    if (!result.ok) failed += 1;
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${check.name}  (${result.detail})`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${check.name}  (${error instanceof Error ? error.message : error})`);
  }
}

console.log(`\n${checks.length - failed} / ${checks.length} 件が成功`);
process.exit(failed === 0 ? 0 : 1);
