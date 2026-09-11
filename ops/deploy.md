# デプロイと疎通確認の手順

フェーズ1 を実際に動かすための手順。`docs/` は仕様の唯一の正なので、
運用手順はこちらに置く。

## 前提

- ホスティングは Vercel（Tokyo）、DB・認証は Supabase 専用プロジェクト、
  決済は Stripe Connect（docs/00 8.2）
- **開発コンテナからは `api.stripe.com` / `api.supabase.com` / `docs.stripe.com` へ
  到達できない**（ネットワークポリシーで 403）。実際の疎通確認はデプロイ先で行う

## 環境変数

`.env.example` が唯一の一覧。Vercel には次を設定する。

| 変数 | 区分 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | クライアントに露出 | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアントに露出 | RLS 前提なので露出してよい |
| `NEXT_PUBLIC_SITE_URL` | クライアントに露出 | 末尾スラッシュなし。デプロイ先の URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **サーバー専用** | Vercel では Sensitive にする |
| `STRIPE_SECRET_KEY` | **サーバー専用** | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | **サーバー専用** | `whsec_...`。手順 4 で決まる |
| `CRON_SECRET` | **サーバー専用** | 引当解放バッチの照合用。`openssl rand -base64 32` |

`NEXT_PUBLIC_` を付けた変数はクライアントバンドルに入る。サーバー専用の 3 つには
絶対に付けないこと。`lib/supabase/service.ts` と `lib/payments/stripe.ts` は
`server-only` を import しているため、誤ってクライアントから辿るとビルドが落ちる。

### 貼り付け時の注意

**値に改行を混ぜないこと。** Vercel の入力欄へコピーするとき、末尾の改行ごと拾ったり
折り返しが改行として入ったりする。キーは HTTP の `Authorization` ヘッダに載るため、
改行が 1 つ入るだけで Node が送信前に `ERR_INVALID_CHAR` で落ちる。SDK の層では
「接続エラー」に化けるので、ログを見るまで原因が分からない
（2026-09-10 に `STRIPE_SECRET_KEY` で実際に発生）。

`lib/supabase/env.ts` の `required()` が前後の空白を落とし、途中に使えない文字が
残っていれば設定エラーとして 503 と変数名を返す。値を貼り直したら **Redeploy が必要**。
環境変数はデプロイに紐づくため、保存しただけでは既存のデプロイに反映されない。

キーの取り違えも入口で弾く。`SUPABASE_SERVICE_ROLE_KEY` に Publishable キー
（`sb_publishable_…`）、`STRIPE_SECRET_KEY` に公開可能キー（`pk_…`）を入れた場合は
設定エラーになる。

---

## 1. Supabase プロジェクト

1. 専用プロジェクトを作成する（NFTマーケットのプロジェクトを流用しない：docs/00 8.1）

2. マイグレーションを適用する

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   `0001_init.sql` から `0011_inventory_reservations.sql` までが順に流れる。
   `0003` の check 制約と `0006` の外部キーは既存行を検証するので、
   **空のプロジェクトに適用すること。**

   CLI を使わず Supabase の SQL Editor に貼る場合は、`supabase/migrations/` の
   ファイルを番号順に 1 つずつ実行する。ファイルを 1 つに連結して一括で
   流しても通る（0008 までを 2026-09-09 に実プロジェクトで確認済み）。

   `0009` は利用規約・プライバシーポリシー・特商法表記・会社概要の 4 ページを
   **下書きとして**作る。雛形のまま公開すると誤った内容を掲示することに
   なるため、本部が `/admin/pages` で内容を入れてから公開に切り替える。

   `0010` はカテゴリーの初期データを入れない。docs/06 フェーズ0-5
   「商品カテゴリーを確定する」が未了のため。テナントは商品を審査に出すとき
   カテゴリーの選択が必要なので、出品を始める前に本部が `/admin/categories`
   から登録すること。

   `0008` の Storage ポリシーは `storage.objects` の所有者の都合で SQL Editor から
   作れない可能性を懸念していたが、実プロジェクトでは問題なく作成できた。
   万一ここで権限エラーになった場合は、Storage → Policies の UI から
   同じ条件のポリシーを作る。

3. スキーマを検証する

   **SQL Editor で実行する場合**は `supabase/tests/verify_schema_sql_editor.sql` を
   貼り付ける。単一の SELECT なのでそのまま動き、6 項目の判定表が返る。

   **psql が使える場合**は、ロールを切り替えて実挙動まで確かめる版がある。

   ```bash
   psql "<接続文字列>" -f supabase/tests/verify_schema.sql
   ```

   続けて、権限と情報保護の実挙動を確かめる。こちらは psql メタコマンドを
   使っていないため、SQL Editor にそのまま貼っても動く。

   ```bash
   psql "<接続文字列>" -f supabase/tests/verify_permissions.sql
   ```

   ロールを `anon` / `authenticated` に切り替え、docs/05 12章の項目
   （他テナントの情報が見えない、担当者は事業者情報を編集できない、
   未承認テナントが外部に出ない、監査ログは本部だけが読めて書き換えられない、
   公開していないサイトページと版が匿名から読めない、
   未承認商品と他店の未公開商品が読めない、テナントが自分の商品を承認できない）
   を 39 項目の判定表で返す。検証用の行は最後に削除する。

   **本番では実行しないこと。** データを書いてから消すため、他の処理と
   同時に走ると一時的に見えてしまう。

   `verify_schema.sql` は `\set` や `\echo` などの psql メタコマンドを含むため、
   SQL Editor では `syntax error at or near "\"` になる。SQL Editor では
   必ず `_sql_editor` の付いたほうを使うこと。

4. 認証のリダイレクト先を登録する（Authentication → URL Configuration）

   ```
   <NEXT_PUBLIC_SITE_URL>/auth/callback
   <NEXT_PUBLIC_SITE_URL>/tenant/auth/callback
   <NEXT_PUBLIC_SITE_URL>/admin/auth/callback
   ```

   面ごとに経路が違うのは、PKCE の code verifier cookie を面の scope に収めるため
   （cookie の path を `/`・`/tenant`・`/admin` に分けている）。3 つとも必要。

5. 型定義を実物に置き換える（推奨）

   ```bash
   npx supabase gen types typescript --project-id <project-ref> > lib/supabase/database.types.ts
   ```

   現在は手書きの暫定版で、フェーズ1 で触るテーブルだけを定義している。

---

## 2. Stripe サンドボックス

1. サンドボックスを作成し、Connect を有効にする
2. プラットフォームのプロフィールを入力する
   （未入力だと `accounts.create` が通らない可能性がある。サンドボックスで確認する）
3. シークレットキー（`sk_test_...`）を控える

### 確認してほしい点

`lib/payments/connect.ts` は現行 API に合わせて `controller` で Express を表現している。
`accounts.create` の `type` は非推奨になっており、SDK 22.6.1（OpenAPI spec v2442）の
型定義にもその旨が書かれている。

| controller | 値 | 根拠（docs/01） |
|---|---|---|
| `stripe_dashboard.type` | `express` | テナントは Express アカウント |
| `requirement_collection` | `stripe` | 本人確認要件の収集は Stripe |
| `fees.payer` | `application` | Stripe 手数料は本部が負担 |
| `losses.payments` | `application` | 返金・チャージバックは本部の残高から |

加えて出金は `manual`、`debit_negative_balances` を有効にしている（docs/01 15.1）。

**この組み合わせは開発コンテナから `docs.stripe.com` に到達できないため、
公式ドキュメントで裏を取れていない。** サンドボックスで実際にアカウントが
作成できるか確認してほしい。

---

## 3. Vercel

1. GitHub リポジトリを連携してプロジェクトを作成する
2. リージョンは `vercel.json` で `hnd1`（東京）に固定してある
3. 環境変数を設定する（`STRIPE_WEBHOOK_SECRET` は手順 4 の後）
4. デプロイする

**Cron の間隔を確認すること。** `vercel.json` で引当解放バッチを 5 分ごとに
設定してある（`*/5 * * * *`）。プランによっては実行回数に上限があり、
その場合は間隔を延ばすか、上位プランにする。

**間隔が延びても売り過ぎは起きない。** 引当の直前に、その SKU の期限切れを
その場で解放しているため（0011）。このバッチは後片付けであって、正しさの
担保ではない。延ばした場合に起きるのは「使われていない引当の行がしばらく
残る」ことだけである。

`preferredRegion` の route segment config は Next.js 16 で非推奨になったため使わない。
リージョンの指定は `vercel.json` だけで行う。

---

## 4. Stripe Webhook

デプロイ先の URL が決まってから登録する。

- エンドポイント：`<NEXT_PUBLIC_SITE_URL>/api/webhooks/stripe`
- 購読するイベント：**`account.updated` のみ**（フェーズ1）。決済系はフェーズ3
- 表示された署名シークレット（`whsec_...`）を Vercel の `STRIPE_WEBHOOK_SECRET` に
  設定し、再デプロイする

---

## 5. 疎通確認

```bash
node scripts/smoke-check.mjs https://<デプロイ先>
```

未ログインで確かめられる範囲の 16 項目を見る。

- 公開画面が開くこと
- `proxy.ts` がテナント画面・本部画面を閉めていること
- API が未認証を 401 で弾くこと（RLS 任せにしていないこと）
- Stripe Webhook が署名なしを 400 で弾くこと
- 配信された HTML にサービスロールキーの痕跡がないこと

**このスクリプトは Supabase への接続性を確認できない。** 未ログインの利用者は
接続の成否にかかわらずログイン画面へ飛ばされるため、区別がつかないからである。
接続の確認は手順 6 のメール認証で初めて行える。

---

## 6. 最初の本部管理者を登録する

`0007` で本部ロールの唯一の正を `hq_members` にしたため、テーブルが空の間は
誰も `is_hq_admin()` を満たせない。最初の 1 人だけはスクリプトで入れる。

1. 対象の担当者が `<デプロイ先>/admin/login` からメール認証を済ませる
   （この時点では権限が無いので、ログイン後に弾かれるのが正しい挙動）

2. 登録する

   ```bash
   export NEXT_PUBLIC_SUPABASE_URL=...
   export SUPABASE_SERVICE_ROLE_KEY=...
   node scripts/bootstrap-hq-admin.mjs admin@example.com "本部管理者" hq_admin
   ```

3. もう一度 `/admin/login` からログインすると本部画面に入れる

2 人目以降は管理画面から追加できる。

---

## 7. 通し動作の確認（手作業）

docs/06 フェーズ1 の完了条件「申請から Stripe オンボーディング完了・本部承認まで
通しで動作し、未承認テナントは出品できない」を確認する。

1. `<デプロイ先>/tenant/login` からテナント用のメールアドレスでログインする
2. `/tenant/apply` で出店申請を出す（事業者情報まで入力）
3. `/tenant/onboarding` から Stripe の手続きを開始し、テスト用の情報で完了させる
4. Stripe から戻ると決済受付・出金が「有効」になる
   - Webhook（`account.updated`）でも同期されるが、この画面は戻ってきた時点で
     Stripe から取り直すため、Webhook が遅れても表示は正しくなる
5. 本部として `/admin/tenants` を開き、対象テナントの詳細で
   「審査を開始する」→「承認する」を実行する
   - Stripe が未完了、または事業者情報が未登録だと、承認できない理由が表示される
     （docs/01 4.3：オンボーディング完了だけでは承認しない）
6. `audit_logs` に `tenant.apply` / `tenant.start_review` / `tenant.approve` が
   実行者つきで残っていることを確認する

### Webhook の重複処理防止

Stripe ダッシュボードから同じイベントを再送し、`stripe_webhook_events` の行が
増えないこと、`processed_at` が入ったままであることを確認する
（docs/05「決済通知の順番が前後しても正しい状態になる」）。

---

## 8. 商品の登録と審査の確認（手作業）

docs/06 フェーズ2-1・2-2。手順 7 でテナントが承認されている必要がある。

1. 本部として `/admin/categories` でカテゴリーを 1 つ登録する
   （本部管理者＋多要素認証が要る。これが無いとテナントは審査に出せない）
2. テナントとして `/tenant/products` から商品を作り、SKU と画像を登録する
3. 「審査に出す」を押す
   - SKU・画像・カテゴリーのどれかが欠けていると、理由が表示されて出せない
4. 本部として `/admin/products` を開く。審査待ちが古い順に並ぶ
5. 所見を書いて「差し戻す」を実行する
   - 理由を空にすると差し戻せないこと
   - テナントの商品画面に理由が表示されること
6. テナントが直して出し直し、本部が「承認して公開する」を実行する
7. 承認した商品の商品名を**テナントが**変更すると、状態が審査待ちに戻ること
   （価格や在庫を変えても戻らないこと）
8. `audit_logs` に `product.create` / `product.submit` / `product.reject` /
   `product.approve` が実行者つきで残っていることを確認する
9. 未ログインのまま `/products` を開き、承認した商品だけが並ぶこと、
   カテゴリー・店舗・商品名で絞り込めること、商品詳細と店舗ページへ
   辿れることを確認する
   - 審査待ちや差し戻しの商品が出ないこと
   - 商品名の検索欄に `%` だけを入れても全件が出ないこと

### 権限の確認

本部オペレーターでログインし、`/admin/products` の詳細で
「販売を停止する」が出ないこと（本部管理者のみ）を確認する。

---

## 既知の制約

- **本部管理者の操作には多要素認証（AAL2）が要る。** 登録画面は `/admin/mfa` に
  あるので、テナントの停止・停止解除を行う前にそこで設定する。審査・承認・差戻しは
  本部オペレーター権限なので設定前でも利用できる
- **法務ページは下書きのまま出荷される。** `0009` が作る利用規約・プライバシー
  ポリシー・特商法表記・会社概要は雛形で、公開していない。公開しないかぎり
  フッターにも `/legal/<slug>` にも出ない。一般公開の前に `/admin/pages` で
  内容を入れて公開すること。編集できるのは本部管理者のみ（AAL2 が要る）
- **カテゴリーを登録するまでテナントは商品を審査に出せない。** 上記のとおり
  初期データを入れていない。`/admin/categories` から登録する（本部管理者のみ）
- カート・注文・決済は未実装（フェーズ3）。そのため商品詳細に購入の導線は無い。
  在庫引当の仕組み（0011）は入っているが、呼び出し元の
  `checkout/preview` がまだ無い
- 商品名の検索は部分一致（`ilike`）で、全文検索の索引を入れていない。
  docs/06 フェーズ6 の想定が商品 20〜50 点のため。件数が増えたら索引を足す
- 注文・決済・ポイント・精算は未実装。フェーズ3 以降
