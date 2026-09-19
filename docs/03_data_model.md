# 03 データ構造

出典：v1.4 7章

# 7 推奨データ構造

専用データベースに新設する。NFTマーケットのテーブルは流用しない。

## 7 1 マーケット主要テーブル

• tenants：テナント基本情報、審査状態、Stripe連結アカウントID

• tenant_members：店舗管理者・担当者と権限

• hq_members：本部運営者と権限（本部管理者・本部オペレーター）。ロール判定の唯一の正とし、退任時は行を消さず無効フラグで残す

• tenant_legal_profiles：特商法・事業者情報・適格請求書登録番号

• stores：店舗ページ

• product_categories：商品カテゴリー。親子関係、表示順、公開状態

• products：商品基本情報。審査状態、審査実行者・日時、審査の所見（review_note。差戻しの理由をテナントへ伝える。本部のみが書ける）、販売形態（pricing_mode）

　pricing_mode は `fixed`（通常販売）と `inquiry`（価格未定・非公開で問い合わせのみ）。
　SKU 単位ではなく商品単位で持つ。同じ商品で「A は価格あり、B は要問い合わせ」という
　売り方は、購入者から見て何が起きているのか分からないため。

　`product_variants.price_incl_tax` は not null なので、価格未定の商品にも 0 が入る。
　**0 円を「無料」と読み違えないよう、価格の表示は必ず pricing_mode で分岐する**
　（`lib/products/price.ts` の `formatPriceFor()`）。`inquiry` の商品は 0014 の
　トリガ（`cart_items_no_inquiry`）がカート投入を拒否し、審査の必須項目からも
　SKU を外す。

• product_inquiries：価格未定の商品への問い合わせ（スレッドの親）。商品、宛先テナント、購入者、状態（open / answered / closed）

　宛先はテナント。本部は全件を読めるが書けない（2026-09-19 決定）。商品の価格を
　答えられるのはテナントだけで、本部を一次受付にすると毎回転送が挟まる。本部にも
　返信させると、どちらが答えるか決まっていない状態で二重返信が起きる。

　tenant_id を商品から非正規化して持つ。RLS の判定で products を join すると
　products 側の RLS も効いてしまう（0008 の罠）。商品は削除しない方針なので食い違わない。

• product_inquiry_messages：問い合わせの発言。**追記専用。**発言者の区分（buyer / tenant）、発言者ID、本文（2000 文字まで、空白だけは不可）

　後から書き換えられると、「何を答えたか」が争点になったときに記録の意味がなくなる。
　point_ledger_entries と同じくトリガで update / delete / truncate を拒否する。
　状態と更新日時は発言が入ったときにトリガが動かす（アプリから 2 回書かない）。

• product_variants：サイズ・色・SKU・価格

• product_images：商品画像

• inventories：在庫数、引当数。在庫数はテナントが編集でき、引当数はサーバー処理だけが動かす（テナントが下げると引当中の在庫を二重に売れる）

• inventory_reservations：購入手続き中の引当（有効期限付き。TTL 15分）。RLS 有効・ポリシーなしで、引当と解放は 0011 の関数を service_role から呼ぶ経路のみ

• buyer_addresses：購入者の配送先（docs/00 5.1「配送先登録」）。宛名、電話番号、郵便番号、都道府県、市区町村、番地、建物名、既定フラグ。都道府県は 0012 の地域別送料と同じ JIS X 0401 の 2 桁コード（名前で持つと表記ゆれで送料の突き合わせが外れる）。郵便番号はハイフン無しの 7 桁で統一し、全角の直しはアプリ側で行う。既定は 1 人 1 件で、0013 の部分一意索引が 2 件目を拒否する。RLS は本人のみで、テナントも本部も読めない

• carts / cart_items：カート。購入者ごと・テナントごとに1つ（0003 の一意索引）。カート投入時には在庫を引き当てない

• shipping_profiles：送料・配送地域・発送日数。地域別送料は region_rules（jsonb）に次の形で持つ。0012 の検査制約（`shipping_profiles_region_rules_shape`）が形を守る

```json
{ "version": 1,
  "rules": [ { "prefectures": ["46", "47"], "fee": 1500 } ] }
```

　都道府県コードは JIS X 0401 の 2 桁（"01"〜"47"）。地域区分（北海道・東北・
　関東…）にしないのは、区分の切り方が配送業者ごとに違い、どの業者にも合わない
　箱になるため。`rules` に出てこない都道府県は base_fee。同じ都道府県が複数の
　ルールに出るのは禁止（どちらの金額になるかが配列の順序で決まり、テナントの
　画面には順序が見えない）。送料無料しきい値（free_threshold）が地域別より優先する。

　**金額はテナント、構造は本部。** いくらにするかを決めるのは配送業者と契約して
　いるテナントだが、jsonb の形はシステムの仕様で、テナントごとに変えられない。
　自由な形を許すとサーバーが送料を再計算できなくなる。

　**離島・中継料は表せない。** 郵便番号単位が要るため v1 では扱わない。必要な
　テナントは基本送料に織り込む。将来入れるときは version 2 とし、version 1 の
　行はそのまま読めるようにする。

• orders：注文親情報。shipping_address（jsonb）は注文時点の配送先を**写し取る**。buyer_addresses への外部キーにはしない。購入者が後から住所を直したり消したりしても、「どこへ送った注文か」が変わってはいけないため。形は 0013 の検査制約（`orders_shipping_address_shape`）が守る

```json
{ "version": 1, "recipientName": "山田 太郎", "phone": "09012345678",
  "postalCode": "1500001", "prefectureCode": "13", "city": "渋谷区",
  "addressLine1": "神宮前 1-2-3", "addressLine2": "ビル 501" }
```

• order_items：注文明細

• payments：決済状態、Stripe PaymentIntent ID

• shipments：配送・追跡番号・発送登録日

• refunds：返金・部分返金

• disputes：チャージバック・紛争、証拠提出期限、回収状態

• settlements / settlement_items：テナント精算、Stripe Transfer ID、Payout ID

• marketplace_fee_rules：販売手数料ルール

• receipts：領収書・適格請求書の発行記録

• stripe_webhook_events：Stripe Webhook の受信記録。イベントIDを主キーとし、同一イベントの二重処理を拒否する。書き込みはサーバーのみ

• site_pages：サイト共通ページ（利用規約・プライバシーポリシー・特商法表記の本部分・会社概要など）。URL、表題、並び順、公開状態、公開中の版

• site_page_revisions：site_pages の本文の版。版番号、本文、改定メモ、作成者。積むだけで書き換えない。公開中の版は削除できない

tenant_legal_profiles との違い：あちらはテナントごとの事業者情報で、店舗ページに掲示する。site_pages はマーケット全体の文書で、本部が管理する。両方が必要（販売者はテナント、決済代行は本部）。

## 7 2 ポイント主要テーブル

• point_accounts：マーケット購入者IDごとのポイント口座

• point_ledger_entries：変更不可の増減イベント台帳

• point_lots：付与単位、有効期限、残量

• point_reservations：決済中の一時確保（有効期限付き）

• point_usage_allocations：予約時に作成し、使用ポイントと注文・注文明細・元ロットの対応を保持する。予約中はreserved、決済成功でcommitted、解除でreleasedへ状態を変え、予約用と確定用で別テーブルを持たない

• point_rules：基本還元、商品別、店舗別ルール

• point_campaigns：期間限定施策

• point_funding_sources：マーケット本部・テナント等の負担元

• point_issuance_budgets：基本還元の警告基準額、キャンペーン発行上限と実績

• point_adjustment_requests：手動調整の申請・承認

• point_reconciliation_logs：日次照合の実行結果と対応履歴。実行日、差分有無、差分内容、対応状況、対応者、対応日時を保存する。実行日ごとに1行とし、バッチの再実行で行が増えないようにする

台帳には最低限、購入者ID、増減量、entry_type、理由、注文ID、注文明細ID、元ロットID、負担者、処理キー、実行者、発生日時、取消元IDを保存する。有効期限と残量はロットで管理する。
