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
- 離島・中継料の扱い（`region_rules` version 2 で入れるか、基本送料に含めるか）
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

### 商品審査（フェーズ2-2）で決めたこと

**審査の更新は「読んだときの状態」を条件に書く。**
`update(...).eq("id", id).eq("status", 読んだ状態)` の形にしてある。
2 人の担当者が同じ商品を開いていると、後から押したほうが前の判断を
黙って上書きしてしまう。0 件更新なら `invalid_transition` を返して
やり直させる。

**差戻しと販売停止には理由を必須にする。**
理由が無いとテナントは何を直せばよいか分からず、審査が往復する。
判定は `lib/products/status.ts` の `reviewRequiresNote()`（純粋関数）に
置き、API と画面の両方から同じものを使う。

**本部の書き込みに service_role を使わない。**
0004 の `hq_write_products` と 0010 のトリガが本部オペレーター以上を
通すため、本部のセッションのままで書ける。service_role を使うと RLS 側が
素通りになり、ポリシーの誤りに気づけなくなる。

**`products.Update` の型で審査列を止めようとしない。**
本部の審査も同じ型を通るため、型で制限すると正当な書き込みができなくなる。
テナントを止めているのはトリガ（`products_guard_review_columns()`）であって
型ではない。型のコメントにその旨を書いてある。

### 公開画面（フェーズ2-4）で決めたこと

**`products` と `stores` の間に外部キーは無い。**
どちらも `tenants` を指す兄弟の関係なので、PostgREST の埋め込み
（`select("...stores(...)")`）では解決できない。テナントIDで引き直して
JavaScript 側で突き合わせる（`lib/products/public.ts`）。手書きの
`database.types.ts` は `Relationships: []` なので型でも弾かれるが、
本物のスキーマにも無いので実行時にも失敗する。

**検索語の `%` と `_` を必ずエスケープする。**
`ilike` はこの 2 文字をワイルドカードとして解釈する。利用者が `%` と
打つだけで全件に一致する（ローカルの PostgreSQL で実際に確認した）。
`escapeLikePattern()` を通すこと。

**公開判定をアプリ側に書かない。**
`status='approved'` の条件はアプリに置かず、RLS
（`products_public_read`）だけに持たせる。2 か所に分けると、片方だけ
直したときに未承認商品が漏れる。一覧・詳細・店舗ページ・トップの
どこも、絞り込み条件しか書いていない。

**flex の子は幅を明示する。**
一覧の札（`components/buyer/product-card.tsx`）で `a` に `w-full` を
付け忘れ、画像のある札だけ `img` に押し広げられて、画像の無い札が
20px 細くなっていた。目視では気づきにくいので、Chromium で
`getBoundingClientRect()` を測って見つけた。

### 在庫引当（0011）で決めたこと

**`revoke ... from public` では権限が外れない。**
Supabase は `alter default privileges in schema public grant all on
functions to anon, authenticated, service_role` を設定してあるため、
public スキーマに関数を作った時点で anon と authenticated に EXECUTE が
**明示的に**付く。PUBLIC 経由ではないので `from public` では外れない。
`revoke all on function ... from public, anon, authenticated` と
名指しで剥がすこと。実際に 0011 で踏み、`pg_default_acl` と `proacl` を
見て気づいた。`verify_permissions.sql` が `has_function_privilege()` で
固定してある（呼んで例外になるかで測ると、内側の関数で弾かれて
PASS のままになり、緩めたことを検出できない）。

**引当は 1 文の UPDATE で決める。**
`update inventories set reserved_quantity = reserved_quantity + n
 where variant_id = v and quantity - reserved_quantity >= n`
この UPDATE が行ロックを取るため、同時に走った 2 つ目は 1 つ目の確定を
待ってから条件を評価し直す。アプリ側で「読んで、確かめて、書く」と
書くと、その隙間で二重に売れる。在庫 2 点に 5 接続を同時にぶつけて
ちょうど 2 件だけ成立することを実測した。

**関数は `security definer` にしない。**
実行権限は service_role だけに与えるが、万一広げてしまっても invoker
なら RLS と `inventories_guard_reserved` が効いて書き込みを拒否する。
definer にするとその最後の壁が無くなる。実際、権限が開いていた間も
匿名からの呼び出しは NULL を返すだけで何も変えられなかった。

**バッチを正しさの担保にしない。**
引当の直前に、その SKU の期限切れをその場で解放する
（`release_expired_for_variant`）。これが無いと、Cron が回るまで在庫が
押さえられたままになり、正しさが実行間隔に依存する。Cron は後片付け。

**`expires_at` を過去にするだけでは期限切れを再現できない。**
0003 に `expires_at > created_at` の検査制約があるため、`created_at` も
一緒に戻す必要がある。テストを書くときに引っかかる。

### カートと金額計算（フェーズ3 の Stripe 非依存部分）で決めたこと

**消費税の税率別内訳は切り捨て。**
税込価格から内税を割り戻すときの丸めは docs に指定が無く、切り捨てで
決めた（2026-09-12）。

**税は行ごとではなく税率ごとにまとめてから割り戻す。**
1000 円の行が 2 つあるとき、行ごとだと 90 + 90 = 180、まとめると
2000 × 10 / 110 = 181。税は取引単位で計算する。

**0.1 と 0.08 を浮動小数のまま使わない。**
どちらも 2 進数で正確に表せない。`TAX_FRACTION` の整数の分子・分母
（10/110、8/108）で計算する。

**`server-only` の import をクライアント側から辿らない（2 度目）。**
`components/buyer/cart-items.tsx` が `lib/cart/cart.ts` の
`MAX_ITEM_QUANTITY` を import してビルドが落ちた。定数だけを
`lib/cart/limits.ts` に出した。typecheck と lint は通り、`npm run build`
で初めて落ちるので、ビルドまで走らせること。

**カートは購入者ごと・テナントごとに 1 つ。**
0003 の `(buyer_id, tenant_id)` 一意索引による。docs/06 4.2 の
「店舗別にまとめ、別々に購入手続きを行う」に対応する。

### 送料の税率と地域別送料（0012）で決めたこと

**送料の消費税率はテナントに決めさせない。**
税法で決まる。送料を別建てで請求する場合、送料は運送役務の対価であって
飲食料品の譲渡の対価ではないため軽減税率の対象にならない（国税庁
「消費税の軽減税率制度に関するQ&A（個別事例編）」問39）。**10% 固定**。
8% の商品だけのカートでも送料は 10%。テナントごとに選べるようにすると、
誤った税率の適格請求書が出る。しかも媒介者交付特例で発行するのは本部なので、
間違いの責任は本部に来る。送料込みで売りたいテナントは送料を 0 円にして
商品価格へ含める（その場合は商品の税率が適用され、Q&A の例外に合う）。

**地域別送料は「値はテナント・構造は本部」で分ける。**
いくらにするかはテナントが決めるが、jsonb の形はシステムの仕様。
自由な形を許すとサーバーが送料を再計算できなくなる
（「金額はすべてサーバー側で再計算する」が守れない）。形は
`lib/shipping/region.ts` と 0012 の検査制約の両方が見る。

**検査制約から呼ぶ関数の EXECUTE は剥がさない。0011 とは逆になる。**
検査制約の式は書き込みを行うロールの権限で評価されるため、
`is_valid_region_rules()` を anon / authenticated から剥がすと、テナント自身の
送料保存が `permission denied for function` で落ちる（ローカルで実測した）。
0011 の引当関数は service_role しか呼ばないので剥がせたが、ここは違う。
`verify_permissions.sql` の 46・47 が「剥がしていないこと」を固定している。

**`jsonb_typeof(p->'rules') <> 'array'` では穴が開く。**
`rules` キーが無いと `jsonb_typeof` は null を返し、`null <> 'array'` は真ではなく
null になる。`case` はそれを「満たさない」と見て次へ進み、以降の検査も
null の配列に対して 0 行を返すため、`{"version":1}` が通っていた。
`is distinct from` を使う。検査関数を書いたら、通ってはいけない形を
一通りぶつけて確かめること（実際にこれで 1 件見つけた）。

**検査制約に副問い合わせは書けない。**関数へ切り出して制約から呼ぶ。
その関数の中では `and` の評価順を当てにしない。
`jsonb_typeof(...) = 'array' and (select ... jsonb_array_elements(...))` と並べると、
配列でないときに `jsonb_array_elements` が例外を投げうる。`case` で順序を固定する。

**「送料が 0 円だから確定」と判定しない。**
基本送料 0 円で沖縄だけ 1,500 円という設定では下限が 0 円になり、
無料に見えて届け先次第で変わる。しきい値で無料になったかどうかを別に見る
（`calculateOrderAmounts` の `freeByThreshold`）。

**離島・中継料は都道府県では表せない。**郵便番号単位が要る。v1 では扱わず、
必要なテナントは基本送料に織り込む。将来は `version: 2` にする。

**Tailwind の後勝ちは class 属性の順序では決まらない。**
`TextInput` が持つ `w-full` に `w-32` を足しても、生成 CSS 側の順序で
`w-full` が勝つ。幅を絞るなら `max-w-*` のように衝突しない道具を使う。
