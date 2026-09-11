# 一般物販マーケット（オーリーポイント）

テナント型の一般物販EC。承認制テナントが出品し、本部が決済・精算・
ポイントを運営する。NFT・メタバース関連システムとは接続しない。

仕様は `docs/` 配下が唯一の正。docs と矛盾する実装は書かない。
docs に書かれていない判断が必要になったら、実装せずに質問する。

## 参照ファイル

| ファイル | 内容 | 読むべき場面 |
|---|---|---|
| docs/00_overview.md | 目的・基本方針・利用者別機能・権限・システム構成 | 常に |
| docs/01_payments.md | 決済・精算・返金・領収書・決定事項 | 決済/精算/返金 |
| docs/02_points.md | オーリーポイント仕様 | ポイント関連すべて |
| docs/03_data_model.md | テーブル一覧 | DB変更 |
| docs/04_api.md | エンドポイント一覧 | API追加 |
| docs/05_test_cases.md | テスト必須項目 | テスト作成 |
| docs/06_phases.md | 実装フェーズ・対象外機能 | 着手前 |

## 絶対に守るルール

### ポイント
- `point_ledger_entries` は追記専用。既存行を UPDATE / DELETE しない。
  訂正・取消は反対取引の行を追加する。
- ポイント残高を直接更新しない。残高は台帳の集計から算出する。
- すべての付与・利用・取消に処理キー（idempotency key）を持たせ、
  重複を拒否する。キーは `order_item_id + entry_type + sequence` を基本とする。
- ロットの消費は有効期限の近い順（FIFO）。
- 明細への配分は最大剰余方式。同率なら `order_item_id` 順。
  再計算しても同じ結果になること。
- 注文時点の還元率・期限・負担者・計算結果を保存する。
  ルール変更を既存注文に遡及適用しない。

### 決済
- Stripe 固有の処理は `lib/payments/` 配下に閉じる。
  注文ロジックやAPIハンドラから Stripe SDK を直接呼ばない。
- Destination charges + `on_behalf_of`。テナントは Express アカウント。
- Stripe Webhook は署名検証し、イベントIDで重複処理を防ぐ。
- 返金は `reverse_transfer=true`。返金額・チャージバックは本部残高から
  引かれる前提で設計する。

### 全般
- 金額・ポイント・送料・税はすべてサーバー側で再計算する。
  クライアントから来た金額を信用しない。
- 認可は RLS と API の両方で行う。RLS だけに依存しない。
- サービスロールキーはサーバー専用。クライアントに露出させない。
- バッチ処理（ポイント確定・失効・引当解放・日次照合）はすべて冪等。
- 在庫引当・ポイント予約の TTL は 15 分。

## 技術スタック

- Next.js（App Router）/ TypeScript
- Supabase（専用プロジェクト。RLS + Storage Policy）
- Stripe Connect（Express, Destination charges, manual payouts）
- Vercel（Tokyo）/ Vercel Cron
- Resend（メール）、LINE ログイン（連携のみ）+ Messaging API（通知）

## 作業の進め方

- 実装前に計画（変更ファイル一覧と処理の流れ）を出す。
  承認を得るまでコードを書かない。
- 1回のタスクで複数フェーズに手を出さない。
- フェーズ4（ポイント）は docs/05_test_cases.md のテストを先に書く。
- 完了時に `npm run typecheck` と `npm test` を通す。
- Stripe の API 仕様は記憶で書かず、公式ドキュメントを確認する。

## 未確定事項（実装で勝手に決めない）

- マーケット正式名称・ドメイン
- 基本還元の月次警告基準額、上乗せキャンペーンの月次上限
- テナント都合返金時の販売手数料の扱い
- 返金時の Stripe 決済手数料の負担区分（初期方針は docs/01 参照）
- 適格請求書の代行発行方式（媒介者交付特例）
- 問い合わせ一次対応の担当

## 実装済み

（各フェーズ完了時に、判明した制約と設計判断をここへ追記する）

### フェーズ1（実装中）で判明した制約

同じ罠を二度踏まないための記録。いずれも実際に本番または検証で詰まった。

**API は cookie の path 配下に置く。**
面ごとにセッション cookie の path を `/`・`/tenant`・`/admin` に分けている。
RFC 6265 5.1.4 の path マッチにより、path が `/tenant` の cookie は
`/api/tenant/application` には送られない。テナント API は `/tenant/api/...`、
本部 API は `/admin/api/...` に置くこと（docs/04 9.0）。
破っても「未認証を 401 で弾く正しい挙動」に見えるため気づけない。
実際にテナント・本部の API が一度も認証されていなかった。
判定は `lib/supabase/audience.ts` の `cookieReachesPath()` にあり、
`tests/auth/api-path-scope.test.ts` で固定してある。

**RLS ポリシーの `using` 式は呼び出し元の権限で評価される。**
ポリシー内で他テーブルを `exists (select ... from tenants ...)` で引くと、
その `tenants` にも RLS がかかる。匿名から見ると常に偽になり、
公開すべき情報が誰にも見えなくなる（特商法表記で発生）。
他テーブルを参照する判定は `security definer` の補助関数に切り出す
（`is_active_tenant()` など）。

**`security definer` 関数の中では `current_user` が所有者に変わる。**
`current_user` でサービスロールかどうかを判定するガードを definer で
書くと、常に真になってガードが素通りする。商品の承認カラムを守る
`products_guard_review_columns()` は invoker のままにしてある。

**環境変数の値に改行や非 ASCII を混ぜない。**
キーは HTTP の `Authorization` ヘッダに載るため、改行が 1 つ入るだけで
Node が送信前に `ERR_INVALID_CHAR` で落ちる。SDK の層では「接続エラー」に
化けるので原因が見えない。`lib/supabase/env.ts` の `required()` が前後の
空白を落とし、途中に使えない文字が残れば `ConfigurationError` にする。
キーの取り違え（`SUPABASE_SERVICE_ROLE_KEY` に `sb_publishable_`、
`STRIPE_SECRET_KEY` に `pk_`）も同じ場所で弾く。

**`server-only` を付けたファイルは vitest から import できない。**
検証ロジックは環境変数を読まない純粋な関数として別ファイルに切り出し、
`server-only` を付けない（`lib/audit/entry.ts`、`lib/http/errors.ts`、
`lib/supabase/service-key.ts`、`lib/payments/secret-key.ts`）。
IO を伴う側にだけ `server-only` を付ける。

**Next.js 16 の変更点。**
`middleware.ts` は非推奨で `proxy.ts` を使う。`cookies()` は async。
Route Handler の `params` は Promise。`LayoutProps` / `PageProps` は
`next typegen` が生成する global なので、`typecheck` は
`next typegen && tsc --noEmit` にしてある。route segment config の
`preferredRegion` は非推奨で、リージョン指定は `vercel.json` で行う。

**Supabase の SQL Editor は psql のメタコマンドを解釈しない。**
`\set` や `\echo` を含む `verify_schema.sql` は貼れない。
SQL Editor 用に単一の SELECT にまとめた
`verify_schema_sql_editor.sql` を使う。

**エラー応答は原因を区別できる形にする。**
設定不足を 500 や「入力内容をご確認ください」で返すと、ログを見るまで
原因が分からない。`lib/http/errors.ts` の `apiErrorResponse()` が
認可の失敗を 401/403、設定不足を 503 と変数名、それ以外を 500 に分け、
どの経路でも必ずログを残す。

### サイト共通ページ（0009）で決めたこと

**本部が入力した本文から HTML を作らない。**
`lib/markdown/parse.ts` は構造（見出し・段落・箇条書き・強調・リンク）だけを
返し、`components/ui/markdown.tsx` が React のノードを組み立てる。
`dangerouslySetInnerHTML` を使わないので、文字列が HTML として解釈される
経路が存在しない。Markdown ライブラリを足さないのはこのため（多くは HTML
文字列を返すので sanitize を維持し続ける責任が生じる）。リンク先だけは
属性として DOM に入るため、`safeHref()` が http / https / mailto と
`/` 始まりのサイト内リンクだけを許す（禁止列挙ではなく許可制）。
`tests/markdown/render.test.tsx` が描画結果の文字列まで見て固定している。

**本文は版として積み、`site_pages` は公開中の版を指すだけにする。**
規約やポリシーは「いつ何を掲示していたか」を後から示せる必要がある。
上書き保存にしない。公開中の版は外部キー（restrict）で削除できない。

**下書きを既定にする。** `0009` の初期 4 ページは公開しない。雛形のまま
公開すると、特商法表記や規約として誤った内容を掲示することになる。

### 商品管理（0010）で決めたこと

**公開中の商品の本文を直したら審査に戻す。**
きれいな内容で承認を取ってから中身を差し替えられると、docs/05
「未承認商品は公開されない」を素通りする経路になる。対象は商品名・説明・
カテゴリー・画像。価格と在庫は戻さない（日常的に動くもので、そのたびに
公開が止まると店が回らない）。判定は `lib/products/status.ts` の
`bodyChangeResetsReview()`。

**引当数はサーバー処理だけが動かす。**
テナントが `reserved_quantity` を下げられると、引当中の在庫を二重に売れる。
`inventories_guard_reserved()` が invoker のまま守る（definer にすると
`current_user` が所有者に変わり `is_service_context()` が常に真になる。
`products_guard_review_columns()` と同じ理由）。

**画像のパスは商品まで縛る。**
0008 の Storage ポリシーは先頭フォルダが自テナントであることしか見ない。
同じテナントの中で別の商品のフォルダを指す `product_images` の行を作れて
しまうため、`lib/products/image-path.ts` の `isOwnImagePath()` で
「この商品のフォルダ直下の素直なファイル名」に限る。前方一致だけでは
`.../../<別の商品>/x.png` が通る。

**カテゴリーは削除しない。**
商品から参照されているカテゴリーを消すと、どの棚にあった商品か
分からなくなる。使わなくなったものは `is_active` を落とす
（0006 の公開読み取りが見ている）。
