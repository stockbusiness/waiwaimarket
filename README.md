# 一般物販マーケット（オーリーポイント）

テナント型の一般物販 EC。承認制テナントが出品し、本部が決済・精算・
ポイントを運営する。NFT・メタバース関連システムとは接続しない。

## 仕様の所在

**`docs/` 配下が仕様の唯一の正である。** docs と矛盾する実装は書かない。
docs に書かれていない判断が必要になったら、実装せずに確認する。

| ファイル | 内容 |
|---|---|
| `docs/00_overview.md` | 目的・基本方針・利用者別機能・権限・システム構成 |
| `docs/01_payments.md` | 決済・精算・返金・領収書 |
| `docs/02_points.md` | オーリーポイント仕様 |
| `docs/03_data_model.md` | テーブル一覧 |
| `docs/04_api.md` | エンドポイント一覧とパス命名規約 |
| `docs/05_test_cases.md` | テスト必須項目 |
| `docs/06_phases.md` | 実装フェーズ・対象外機能 |

開発時の遵守事項は `CLAUDE.md` にある。

## 技術スタック

- Next.js 16（App Router）/ TypeScript
- Supabase（専用プロジェクト。RLS + Storage Policy）
- Stripe Connect（Express、Destination charges、manual payouts）
- Vercel（Tokyo）/ Vercel Cron
- Resend（メール）、LINE ログイン（連携のみ）+ Messaging API（通知）

## ディレクトリ構成

```
app/                     画面と Route Handler
  api/webhooks/stripe/   Stripe Webhook（cookie を使わない）
  tenant/                テナント面（cookie path = /tenant）
    api/                 テナント API はこの配下に置く
  admin/                 本部面（cookie path = /admin）
    api/                 本部 API はこの配下に置く
lib/
  auth/                  面ごとの認証・認可ガード
  audit/                 監査ログ
  http/                  API エラー応答と利用者向け文言
  payments/              Stripe 固有の処理はここに閉じる
  supabase/              クライアント生成と環境変数
  tenants/               出店申請・審査の状態遷移
  validation/            入力スキーマ（zod）
supabase/migrations/     0001 から順に適用する
supabase/tests/          スキーマ検証 SQL と検証記録
scripts/                 疎通確認・初期セットアップ
ops/deploy.md            デプロイと疎通確認の手順
tests/                   vitest
proxy.ts                 面ごとのセッション振り分け（Next.js 16）
```

## API のパスについて

購入者・テナント・本部は別ログイン・別セッションで、セッション cookie の
path を `/`・`/tenant`・`/admin` に分けている。**API は cookie の path 配下に
置くこと。**

| 面 | cookie の path | API のパス |
|---|---|---|
| 購入者 | `/` | `/api/...` |
| テナント | `/tenant` | `/tenant/api/...` |
| 本部 | `/admin` | `/admin/api/...` |

RFC 6265 5.1.4 の path マッチにより、path が `/tenant` の cookie は
`/api/tenant/...` には送られない。これを破ると API が cookie を受け取れず、
常に未認証として扱われる。詳細は `docs/04_api.md` 9.0。

## セットアップ

```bash
npm install
cp .env.example .env.local   # 値を設定する
npm run dev
```

環境変数の一覧は `.env.example` が正。`NEXT_PUBLIC_` を付けた変数は
クライアントバンドルに入るため、サービスロールキーと Stripe の
シークレットキーには絶対に付けない。

Supabase・Stripe・Vercel の実際の設定手順は `ops/deploy.md` にある。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | vitest（1回実行） |
| `npm run test:watch` | vitest（監視） |

完了時は `npm run typecheck` と `npm test` を通すこと。

`node scripts/smoke-check.mjs https://<デプロイ先>` で、未ログインで
確認できる範囲の疎通を見る。

## データベース

マイグレーションは `supabase/migrations/` に番号順で置く。既存ファイルは
書き換えず、変更は新しい番号のファイルとして追加する。

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

適用後の検証は `supabase/tests/verify_schema_sql_editor.sql` を Supabase の
SQL Editor に貼る（単一の SELECT で 6 項目の判定表が返る）。psql が使える
場合は `supabase/tests/verify_schema.sql` がロールを切り替えて実挙動まで
確かめる。

## 実装状況

`docs/06_phases.md` のフェーズ 1（共通基盤とテナント管理）を実装中。
フェーズ 2 以降は未着手。
