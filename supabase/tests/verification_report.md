# 0001 / 0002 スキーマ検証レポート

- 対象: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`
- 基準: `docs/03_data_model.md`, `docs/02_points.md`（補助として `docs/00`, `docs/05`, `docs/06`）
- 実施日: 2026-09-09
- 関連 PR: [stockbusiness/waiwaimarket#1](https://github.com/stockbusiness/waiwaimarket/pull/1)

## 結論

テーブルの網羅性は仕様どおりだが、**制約・RLS・残高算出の 3 領域に不足**があった。
既存 2 ファイルは変更せず、差分を `0003`〜`0005` の追加マイグレーションとして提案する。

| 領域 | 状態 | 対応 |
|---|---|---|
| テーブル一覧（docs/03 7.1・7.2） | 充足 | 変更なし |
| 台帳の必須項目（docs/03 末尾） | 充足 | 変更なし |
| 制約・冪等性 | 不足 10 件 | `0003_constraints.sql` |
| RLS・権限 | 不足 6 件（うち重大 2 件） | `0004_rls_completion.sql` |
| 残高算出・集計 | 不足 4 件 | `0005_point_balance_views.sql` |

---

## 1. 検証方法

ローカルの PostgreSQL 16 に Supabase 相当の最小スタブを用意し、
`0001 → 0005` を通し適用したうえで実挙動を確認した。

スタブの内容:

- `auth` スキーマと `auth.uid()` / `auth.jwt()`
- ロール `anon` / `authenticated` / `service_role`
- `public` スキーマへの既定 GRANT（Supabase が既定で付与するもの）

検証は次の 3 段構えで行った。

1. 各 SQL と `docs/` の読み合わせ
2. `supabase/tests/verify_schema.sql` による 3 項目の自動判定
3. 制約の拒否・残高ビューの値・ロール別 RLS 挙動の実測

検証環境は実行後に破棄している。既存データには影響しない。

---

## 2. 満たされていた点

- `docs/03` 7.1 / 7.2 のテーブルはすべて存在する（全 34 テーブル）
- 台帳の必須項目が全列そろっている
  （購入者ID・増減量・`entry_type`・理由・注文ID・注文明細ID・元ロットID・
  負担者・処理キー・実行者・発生日時・取消元ID）
- 台帳の UPDATE / DELETE 禁止トリガが機能する
- `point_ledger_entries.idempotency_key` の一意制約がある
- FIFO 消費用インデックス `point_lots (buyer_id, status, expires_at)` がある
- 残高列を持たず、台帳から算出する方針になっている
- `point_usage_allocations` が予約用と確定用に分かれていない（docs/03 7.2 の指定どおり）

---

## 3. 不足していた点

重大なものから並べる。

| # | 箇所 | 内容 | 根拠 |
|---|---|---|---|
| 1 | 0002 | `carts` `cart_items` `inventory_reservations` `shipping_profiles` `refund_items` `marketplace_fee_rules` `point_funding_sources` `point_rules` `point_campaigns` `point_issuance_budgets` の **10 テーブルで RLS が未有効**。Supabase は public スキーマへ anon / authenticated に既定で権限を付与するため、カート内容もポイントルールも手数料率も実質全開放になる | docs/00 8.2、docs/05 権限と情報保護 |
| 2 | 0002 | `products_tenant_all` の `with check` が `tenant_id` しか見ておらず、**テナントが自分の商品を `status='approved'` にできる**。未承認・停止中テナントの出品も止まらない | docs/00 5.3、docs/06 フェーズ1・2完了条件、docs/05「未承認商品は公開されない」 |
| 3 | 0001 | `point_balances` ビューが `security_invoker` でないため **RLS を迂回して他人の残高を読める** | docs/00 8.2 |
| 4 | 0001 | `point_balances` が **予約中ポイントを利用可能残高から控除していない** | docs/02 6.2 |
| 5 | 0001 | `earn_confirmed` を記録しても **`pending_points` が減らない**（確定後も付与予定に残り続ける） | docs/02 6.2、6.3-8 |
| 6 | 0002 | `inventories` `settlement_items` `point_usage_allocations` `tenant_members` は RLS 有効かつ**ポリシーが 1 件もなく、誰も参照できない**。在庫表示、テナントの精算明細確認、利用配分の再現、担当者管理が不可能 | docs/00 5.2・5.4、docs/05「元ロット・明細別使用数を再現できる」 |
| 7 | 0002 | **購入者が自分の配送状況を見られない**（`shipments` にテナント用ポリシーしかない） | docs/00 5.1 |
| 8 | 0002 | テナントが **SKU・商品画像・店舗情報・送料を編集できない**（`products` にしか書き込みポリシーがない） | docs/00 5.2 |
| 9 | 0001 | 付与ロットに冪等キーがなく、**同一の決済通知の再送でロットだけ二重に作られる**（台帳のみ一意制約） | docs/02 6.5、フェーズ4完了条件 |
| 10 | 0001 | `point_issuance_budgets` の `unique (year_month, kind, campaign_id)` は `campaign_id` が NULL のとき効かない。**基本還元の警告基準額を同一年月に何行でも登録できる** | docs/02 4.4 |
| 11 | 0001 | 注文時点の還元率が注文単位の `orders.point_rule_snapshot` にしかなく、**商品別・店舗別ルールがあると明細ごとの適用率を再現できない** | CLAUDE.md ポイント絶対ルール、docs/02 6.3-7 |
| 12 | 0001 | `inventories` に `reserved_quantity <= quantity` がない | docs/06 フェーズ2完了条件 |
| 13 | 0001 | 注文金額の整合チェックがなく、**円決済額 0（全額ポイント購入）を DB が受け入れる** | docs/02 6.1 |
| 14 | 0001 | 台帳の `delta` の符号が `entry_type` と無関係に入る。符号ミスは残高そのものを壊す | docs/02 6.2 |
| 15 | 0001 | `earn_reversal` の取消元が任意のため、**付与予定の取消か確定済みの取消かを台帳から判別できない** | docs/03 台帳必須項目 |
| 16 | 0002 | `auth_tenant_ids()` が `security definer` かつ `search_path` 未固定 | 一般的な Supabase の指摘事項 |
| 17 | 0001 | 台帳の TRUNCATE が素通りする（UPDATE / DELETE のみ禁止） | docs/02 6.2 追記専用 |
| 18 | 0001 | 在庫引当・ポイント予約の TTL 15 分が既定値にも制約にもなっていない | docs/06 4.2、docs/02 6.3-3 |
| 19 | 0001 | 本部が「未使用残高・最大値引き原資・基本還元額・キャンペーン発行額・利用額・失効額」を分けて集計する手段がない | docs/02 4.4、docs/00 成功条件7 |
| 20 | 0001 | 「台帳合計と口座残高の一致を日次で照合」する手段がない | docs/02 6.5 |

---

## 4. 追加したマイグレーション

### `0003_constraints.sql`（上表 9〜18）

制約とインデックスの補完。

- 在庫引当が実在庫を超えないことを制約化
- 在庫引当・ポイント予約の TTL 15 分を既定値化
- 注文金額の整合と円決済額 1 円以上（全額ポイント購入の禁止）
- 台帳の `entry_type` ごとの符号、取消元必須、調整の実行者必須、理由の空文字禁止
- 台帳の TRUNCATE 禁止
- 付与ロットの冪等キーと、注文時点の還元率・適用ルールの保存
- 基本還元の月次警告基準額が年月ごとに一意になる部分インデックス
- ポイント利用配分の返還上限、ルール・キャンペーンの値域
- `updated_at` の自動更新トリガ

利用上限比率（初期 50%）は `point_rules.usage_cap_ratio` で可変のため、
`check` にはハードコードせず API 側で検証する方針とした。

### `0004_rls_completion.sql`（上表 1・2・6・7・8・16）

RLS の補完。

- 未有効 10 テーブルの有効化
- 不足していた閲覧・編集ポリシーの追加
- 未承認・停止中テナントの商品と店舗を公開対象から除外
- 商品審査権限の分離（ポリシー置き換え＋審査列を守るトリガ）
- `security definer` 関数の `search_path` 固定

`inventory_reservations` は意図的にポリシーを置かず、引当と解放を
サーバー処理（service_role）に限定している。
在庫数量・注文金額・ポイント台帳への書き込みポリシーも同様に置いていない。

### `0005_point_balance_views.sql`（上表 3・4・5・19・20）

残高算出の是正と集計ビュー。

- `point_balances` を `available_points` / `pending_points` / `reserved_points` /
  `usable_points` に再定義
- `point_outstanding_liability`（未使用残高・最大値引き原資）
- `point_monthly_movements`（月次の発行・確定・利用・返還・失効・取消・調整）
- `point_balance_reconciliation`（日次照合）
- 全ビューを `security_invoker` に設定

`earn_reversal` が付与予定と確定済みのどちらを打ち消したかは、
`reversal_of` の指す元エントリの `entry_type` で判別する。
このため `0003` で `earn_reversal` の `reversal_of` を必須にしている。

---

## 5. 実行結果

### 5.1 `verify_schema.sql` の 3 項目

`0003` までを適用した DB と `0005` までを適用した DB に、同じスクリプトを流した。
項目 1 は `0004`、項目 3 は `0005` で対応しているため、`0003` 単体では落ちる。

| # | 検証項目 | 0003 まで | 0005 まで |
|---|---|---|---|
| 1 | 全テーブルで RLS 有効 | **FAIL** — 無効 10 件 | **PASS** — 無効 0 件 |
| 2 | テナントが products を approved に UPDATE | **FAIL** — `UPDATE 1 行が通り、status が approved になった` | **PASS** — `例外で拒否: 商品の承認・差戻しは本部のみが行えます` |
| 3 | `point_balances` が security_invoker | **FAIL** — `(未設定)` | **PASS** — `security_invoker=on` |

### 5.2 RLS の有効状況（全 34 テーブル）

`0003` 適用時点で RLS が無効だったテーブル:

```
cart_items, carts, inventory_reservations, marketplace_fee_rules,
point_campaigns, point_funding_sources, point_issuance_budgets,
point_rules, refund_items, shipping_profiles
```

`0003` 適用時点で RLS 有効かつポリシー 0 件だったテーブル（誰も参照できない）:

```
inventories, point_usage_allocations, settlement_items, tenant_members
```

`0005` 適用後のポリシー数の変化:

| テーブル | 0003 まで | 0005 まで |
|---|---|---|
| `inventories` | 0 | 3 |
| `point_usage_allocations` | 0 | 2 |
| `settlement_items` | 0 | 2 |
| `tenant_members` | 0 | 5 |
| `products` | 3 | 7 |
| `shipments` | 1 | 3 |
| `product_variants` | 1 | 3 |
| `inventory_reservations` | 0（RLS 無効） | 0（RLS 有効・意図的） |

### 5.3 ビューの `security_invoker`

`0005` 適用後、4 ビューすべてが `security_invoker=on`。

```
point_balance_reconciliation | security_invoker=on | OK
point_balances               | security_invoker=on | OK
point_monthly_movements      | security_invoker=on | OK
point_outstanding_liability  | security_invoker=on | OK
```

### 5.4 制約の拒否（14 件すべて期待どおり拒否）

| # | 試した操作 | 拒否した制約 |
|---|---|---|
| 1 | 在庫 1 に対して引当 2 | `inventories_reserved_within_stock` |
| 2 | 円決済額 0 の注文（全額ポイント購入） | `orders_charge_positive` |
| 3 | 合計金額が内訳と一致しない注文 | `orders_total_consistent` |
| 4 | `spend` に正の `delta` | `point_ledger_delta_sign` |
| 5 | `earn_reversal` に取消元なし | `point_ledger_reversal_requires_origin` |
| 6 | `adjustment` に実行者なし | `point_ledger_adjustment_requires_actor` |
| 7 | 台帳の UPDATE | `point_ledger_append_only()` トリガ |
| 8 | 台帳の TRUNCATE CASCADE | `point_ledger_append_only()` トリガ |
| 9 | 購入付与ロットに冪等キーなし | `point_lots_purchase_grant_requires_key` |
| 10 | 同一冪等キーのロット再作成（決済通知の再送） | `point_lots_idempotency_key_uniq` |
| 11 | 同一年月に基本還元の警告基準額を二重登録 | `point_issuance_budgets_month_kind_nocampaign_uniq` |
| 12 | 返還ポイント > 使用ポイント | `point_usage_alloc_refund_within_points` |
| 13 | `scope='base'` なのに `target_id` あり | `point_rules_target_matches_scope` |
| 14 | 同一購入者・同一テナントで二重カート | `carts_buyer_tenant_uniq` |

### 5.5 残高ビューの値

付与予定 100pt（うち 60pt を確定、40pt は予定のまま）、予約 25pt の状態:

```
 buyer_id | available_points | pending_points | reserved_points | usable_points
----------+------------------+----------------+-----------------+---------------
 4444...  |               60 |             40 |              25 |            35
```

付与予定 40pt を `earn_reversal` で取り消した後:

```
 available_points | pending_points | reserved_points | usable_points
------------------+----------------+-----------------+---------------
               60 |              0 |              25 |            35
```

`earn_confirmed` により `pending_points` が正しく減り、予約 25pt が
`usable_points` から控除されている。

日次照合ビュー（台帳合計とロット残量の差分）:

```
 ledger_available | lot_available | available_difference | ledger_pending | lot_pending | pending_difference
------------------+---------------+----------------------+----------------+-------------+--------------------
               60 |            60 |                    0 |             40 |          40 |                  0
```

本部集計ビュー:

```
 funding_source_type | rule_scope | pending | available | max_discount_reserve
---------------------+------------+---------+-----------+----------------------
 headquarters        | base       |       0 |        60 |                   60

 year_month | rule_scope | issued | confirmed | reversed
------------+------------+--------+-----------+----------
 2026-09-01 | base       |    100 |        60 |       40
```

### 5.6 ロール別の RLS 挙動（`0005` 適用後）

| ロール | 操作 | 結果 |
|---|---|---|
| anon | 商品一覧 | 承認テナントの承認済み商品のみ。未承認テナントの `approved` 商品は非表示 |
| anon | 店舗一覧 | 公開かつ承認テナントの店舗のみ |
| anon | `carts` / `point_rules` / `marketplace_fee_rules` | いずれも 0 件 |
| anon | `inventories` | 公開商品の在庫は参照可 |
| テナント管理者 | `draft → submitted` | 成功 |
| テナント管理者 | `draft → approved` | 例外で拒否 |
| テナント管理者 | 審査列（`reviewed_by` / `reviewed_at`）の書き換え | 例外で拒否 |
| テナント管理者 | `status='approved'` での商品新規作成 | 例外で拒否 |
| テナント管理者 | 他テナントの商品を編集 | 0 行 |
| テナント管理者 | 他購入者のポイント残高 | 0 件 |
| テナント管理者 | 自テナント情報・自店舗の在庫 | 参照可 |
| 購入者 | 自分の注文の配送状況 | 参照可 |
| 購入者 | 自分のポイント残高 | 参照可。他人の残高は 0 件 |
| 本部オペレーター | 全台帳・精算明細 | 参照可 |
| 本部オペレーター | `point_rules` の更新 | 0 行（本部管理者のみ） |
| service_role | 商品の承認 | 成功 |

---

## 6. 検証中に見つかった実装上の注意

`products_guard_review_columns()` を当初 `security definer` で書いたところ、
関数内の `current_user` が関数所有者に変わるため `is_service_context()` が
常に真になり、ガードが素通りしていた。実測で判明したため `security invoker`
（既定）に変更している。同種のトリガを追加する際は同じ罠に注意する。

---

## 7. docs に記載がなく、実装せず確認したい点

CLAUDE.md の「docs に書かれていない判断が必要になったら、実装せずに質問する」に従い、
以下は実装していない。

1. **Stripe Webhook のイベントID重複防止テーブル**
   `docs/04` と CLAUDE.md が「イベントIDで重複処理を防ぐ」を求めているが、
   `docs/03` のテーブル一覧に該当テーブルがない。
   DB で保証するなら `stripe_webhook_events` 相当が要る。
2. **日次照合の結果を残すテーブル**
   `docs/02` 6.5 の日次照合はビューで検知できるようにしたが、
   検知結果と対応状況を残すテーブルは `docs/03` にない。
3. **カテゴリーのテーブル**
   `products.category_id` に FK がなく、`docs/03` にカテゴリーのテーブルがない。
   `docs/00` 5.3 の「カテゴリー・特集管理」をどう持たせるか。
4. **`point_rules` の購入者への公開範囲**
   商品ページに還元率を表示するには読み取りが要るが、キャンペーン設定まで
   公開してよいかが不明なため、本作業では本部限定にしている。
5. **`payments` のテナント閲覧可否**
   `docs/00` 5.2 の売上確認は `settlements` で足りると判断し、
   Stripe ID を含む `payments` は本部限定にしている。
6. **商品の削除条件**
   `status='draft'` のみテナントに許可した。
   承認済み商品は「販売停止」で扱う想定でよいか。
7. **`pgcrypto` のスキーマ**
   `0001` は既定スキーマに作成している。Supabase の慣例は `extensions`
   スキーマだが、既存ファイルは変更していない。

---

## 8. リスクと前提

- `0004` は `products_public_read` / `stores_public_read` / `products_tenant_all` を
  `drop` してから作り直している。既存 2 ファイルは変更していないが、
  ポリシーの置き換えである点は明示しておく。
- `0003` の `check` 制約は既存行を検証するため、すでにデータが入った環境では
  適用前にデータ側の確認が必要になる。現時点ではアプリ実装前のため空を前提としている。
- TypeScript の変更はない。`package.json` に `typecheck` / `test` スクリプトは
  未定義のため、CLAUDE.md の完了条件は SQL の実適用による検証で代替している。

---

## 9. 再現手順

```bash
# 適用
psql -d <db> -f supabase/migrations/0001_init.sql
psql -d <db> -f supabase/migrations/0002_rls.sql
psql -d <db> -f supabase/migrations/0003_constraints.sql
psql -d <db> -f supabase/migrations/0004_rls_completion.sql
psql -d <db> -f supabase/migrations/0005_point_balance_views.sql

# 検証
psql -d <db> -f supabase/tests/verify_schema.sql
```

Supabase 以外で実行する場合は、事前に `auth.uid()` / `auth.jwt()` と
`anon` / `authenticated` / `service_role` ロール、および public スキーマへの
GRANT を用意する必要がある。

---

## 追記: `0006_missing_tables.sql`（2026-09-09）

`docs/03_data_model.md` の仕様漏れを補正し、第 7 章 1〜3 の未確定事項を反映した。
docs 側にも 3 テーブルを追記済み。

### 追加内容

| 対象 | 内容 | 権限 |
|---|---|---|
| `stripe_webhook_events` | `event_id` 主キー、`type`、`payload`、`received_at`、`processed_at`、`process_error`、`attempts` | 書き込みは service_role のみ。閲覧は本部管理者のみ |
| `point_reconciliation_logs` | 実行日、差分有無、差分件数、差分内容、対応状況、対応者、対応日時 | 本部管理者のみ参照・更新 |
| `product_categories` | `id`、`parent_id`、`name`、`slug`、`sort_order`、`is_active` | 公開読み取り可。書き込みは本部管理者のみ |
| `pgcrypto` | `public` → `extensions` スキーマへ移動 | — |

`products.category_id` に `on delete set null` の外部キーを張った。

### 確定済みポイントの取消（`earn_confirmed` → `earn_reversal`）

税込 10,000 円の注文に対する基本還元 100pt の遷移を実測した。

| ステップ | 台帳への追記 | available | pending | usable |
|---|---|---|---|---|
| 0 | （台帳が空） | 0 | 0 | 0 |
| 1 | `earn_pending` +100 | 0 | 100 | 0 |
| 2 | `earn_confirmed` +100 | 100 | 0 | 100 |
| 3 | `earn_reversal` −40（取消元 = `earn_confirmed`） | **60** | 0 | 60 |
| 4 | `earn_reversal` −60（取消元 = `earn_confirmed`） | **0** | 0 | 0 |

対比として、確定前の `earn_pending` を取り消した場合は `pending` のみが減り、
`available` は 0 のまま動かないことも確認した。

台帳は 4 行の追記のみで、既存行の UPDATE / DELETE は発生していない。
日次照合ビューの `available_difference` は全購入者で 0。

### 制約の拒否（7 件すべて期待どおり拒否）

| # | 試した操作 | 拒否した制約 |
|---|---|---|
| 1 | 同一 `event_id` の Webhook 再送 | `stripe_webhook_events_pkey` |
| 2 | 照合バッチの同日二重実行 | `point_reconciliation_logs_executed_on_key` |
| 3 | 差分ありなのに件数 0 | `point_recon_difference_consistent` |
| 4 | 差分ありを対応記録なしで `resolved` に | `point_recon_closed_requires_resolution` |
| 5 | 存在しないカテゴリーを商品に設定 | `products_category_id_fkey` |
| 6 | 不正な slug（`Drinks_JP`） | `product_categories_slug_format` |
| 7 | 自分自身を親カテゴリーに設定 | `product_categories_no_self_parent` |

### ロール別の閲覧範囲

| ロール | `product_categories` | `stripe_webhook_events` | `point_reconciliation_logs` |
|---|---|---|---|
| anon | 有効なもののみ（1/2 件） | 0 件 | 0 件 |
| 本部オペレーター | 無効含む全件（2/2 件） | 0 件 | 0 件 |
| 本部管理者 | 全件 | 全件 | 全件 |

`verify_schema.sql` の 3 項目は `0006` 適用後も PASS。

---

## 追記: `0007_hq_members.sql`（2026-09-09、フェーズ1 PR A）

本部ユーザーの管理をテーブル化し、`is_hq_admin()` / `is_hq_operator()` の
判定元を JWT の `app_metadata.role` から `hq_members` へ差し替えた。
関数名とシグネチャは変えていないため、`0002`〜`0006` のポリシーはそのまま動く。

### 挙動の変化

**`app_metadata.role` に `hq_admin` を詰めても本部権限は得られなくなった。**
実測でも `is_hq_admin()` / `is_hq_operator()` がともに false を返すことを確認している。
ロールの唯一の正が `hq_members` になったため、権限の付与は本部管理者による
テーブル操作（と監査ログ）を必ず経由する。

### 実測結果

| 利用者 | `current_hq_role()` | `is_hq_admin()` | `is_hq_operator()` | 見える `hq_members` |
|---|---|---|---|---|
| 本部管理者 | `hq_admin` | t | t | 全 3 件 |
| 本部オペレーター | `hq_operator` | f | t | 全 3 件 |
| 退任者（`is_active=false`） | NULL | f | f | 自分の 1 件のみ |
| 本部でない利用者 | NULL | f | f | 0 件 |
| 匿名 | NULL | f | — | 0 件 |
| `app_metadata.role=hq_admin` を詰めた一般利用者 | NULL | **f** | **f** | 0 件 |

あわせて次を確認した。

- 本部オペレーターは `point_rules` を更新できない（0 行）
- 本部オペレーターは `hq_members` を追加できない（RLS ポリシー違反で拒否）
- 退任者は自分の行だけ見えるため、無効化された事実を画面に出せる
- `verify_schema.sql` の 3 項目は `0007` 適用後も PASS

### 初期登録

`hq_members` が空の間は誰も本部管理者になれないため、最初の 1 人だけは
service_role か psql で登録する必要がある。手順はマイグレーション末尾に記載した。

### アプリ側の検証（PR A）

| 確認項目 | 結果 |
|---|---|
| `npm test` | 45 件すべて成功 |
| `npm run typecheck` | エラーなし（`next typegen` 込み） |
| `npm run lint` | 指摘なし |
| `npm run build` | 成功。全 13 経路と Proxy を認識 |
| サービスロールキーがクライアントバンドルに含まれない | `.next/static` に該当なし |
| Client Component から `lib/supabase/service.ts` を import | **ビルドが失敗する**（`server-only` が遮断） |

最後の 2 つは docs/05「サービスロールキーをクライアントから取得できない」を
規約ではなく仕組みで担保できていることの確認である。

---

## 追記: 実 Supabase プロジェクトへの適用（2026-09-09）

`0001`〜`0008` を実際の Supabase プロジェクトへ適用し、
`supabase/tests/verify_schema_sql_editor.sql` で確認した。

| # | 検証項目 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | テーブルとビューが揃っている | テーブル 38・ビュー 4 | テーブル 38・ビュー 4 | PASS |
| 2 | 全テーブルで RLS が有効 | RLS 無効テーブル 0 件 | RLS 無効テーブル 0 件 | PASS |
| 3 | 商品の審査ガードが入っている | トリガ 1・関数 1 | トリガ 1・関数 1 | PASS |
| 4 | `point_balances` が security_invoker | `security_invoker=on` | `security_invoker=on` | PASS |
| 5 | Storage バケットが作られた | 2 件 | 2 件 | PASS |
| 6 | Storage ポリシーが作られた | 8 件 | 8 件 | PASS |

**懸念していた Storage ポリシーの権限エラーは起きなかった。**
`storage.objects` の所有者は `supabase_storage_admin` のため SQL Editor の
実行ロールではポリシーを作れない可能性を事前に挙げていたが、実プロジェクトでは
8 件すべて作成できている。

これまで検証がスタブ止まりだった次の 2 点が、実物で確認できたことになる。

- 8 本のマイグレーションが実 Supabase で通ること（連結して一括実行でも可）
- Storage のバケットとポリシーが実際に作られること

一方、Storage ポリシーの**挙動**（テナントが他店舗のフォルダへ書き込めないこと等）は
まだ実物で確認していない。アプリをデプロイして実際のアップロードを試す段階で確かめる。
