# 04 API設計

出典：v1.4 9章

# 9 API案

## 9.0 パス命名規約

面（購入者・テナント・本部）は別ログイン・別セッションとする（docs/00 5.4）。
セッション cookie は面ごとに分け、path をそれぞれ `/`・`/tenant`・`/admin` に絞る。

**この cookie の path 配下に API を置くこと。**

| 面 | cookie の path | API のパス |
|---|---|---|
| 購入者 | `/` | `/api/...` |
| テナント | `/tenant` | `/tenant/api/...` |
| 本部 | `/admin` | `/admin/api/...` |

理由は RFC 6265 5.1.4 の path マッチである。cookie の path が `/tenant` のとき、
リクエストパス `/api/tenant/application` には cookie が**送られない**。
`/tenant` で始まらないためである。購入者面だけは path が `/` なので
`/api/...` のままでよい。

これを守らないと、API は cookie を受け取れないまま常に未認証として扱われる。
一見すると「未認証を 401 で弾いている」正しい挙動に見えるため、
テナント・本部の API が一度も認証されていないことに気づけない。実際に起きた。

cookie を使わない経路はこの規約の対象外とする。

- Stripe Webhook（署名検証で認証する）
- 内部API（サービス間認証を使う）

## 9.1 公開 購入者API

• GET /api/market/products

• GET /api/market/products/{id}

• GET /api/market/stores/{id}

　上の 3 つは未実装。商品一覧（`/products`）・商品詳細（`/products/{id}`）・
　店舗ページ（`/stores/{slug}`）はサーバー側で描画し、RLS 越しに直接読むため、
　ブラウザから叩く API を必要としない。カートを非同期で操作するフェーズ3 で
　必要になった時点で作る。公開判定はいずれの経路でも RLS が持つ
　（`products_public_read` が承認済み商品かつ承認済みテナントに限る）。

• POST /api/market/cart/items（SKU と数量だけを受け取る。金額もテナントIDも渡させない）

• PATCH /api/market/cart/items/{itemId}（数量変更）

• DELETE /api/market/cart/items/{itemId}

• POST /api/market/addresses（配送先の登録）

• PUT /api/market/addresses/{id}、DELETE /api/market/addresses/{id}

  購入者IDはセッションから取る。body では受け取らない。郵便番号と電話番号は
  全角のままでも受けて半角に直す（スマートフォンの日本語入力では全角のまま
  確定されることが多く、弾くと打ち直させるだけになる）。他人の住所は RLS
  （0013 `buyer_addresses_self_all`）が弾き、0 件なら `not_found` を返す。
  「他人のものだから拒否した」と区別できる応答にすると、存在するかどうかを
  外から確かめられてしまう。

• POST /api/market/inquiries（価格未定の商品への問い合わせ。商品IDと本文だけを受け取る）

  宛先のテナントも発言者も body では受け取らない。テナントは商品から引き直し、
  発言者はセッションから取る（カート投入で SKU からテナントを引くのと同じ理由。
  渡させると、任意のテナント宛てに、他人の名前でスレッドを作れる）。

  **スレッドと 1 通目は DB 側の 1 回の呼び出しにまとめる**（0014 の
  `create_product_inquiry()`）。2 回に分けて書くと、1 通目で落ちたときに発言が
  0 件のスレッドが残り、店側は何を聞かれたのか分からないまま未回答を抱える。

  対象は `pricing_mode = 'inquiry'` の商品だけ。通常の商品に開けると、
  「カートに入れて買う」の外に、店ごとに形式の違うやり取りが増える。

  ログイン必須。匿名で受けると、同じ人からの続きの質問かが分からず、
  返事の届け先も無い。

• POST /api/market/inquiries/{id}/messages（購入者からの追記）

  読めないスレッドは `not_found` を返す。「他人のものだから拒否した」と区別できる
  応答にすると、存在するかどうかを外から確かめられてしまう（配送先と同じ扱い）。
  完了したスレッドへの追記は `closed` で拒否する。

• POST /api/market/checkout/preview（在庫引当・ポイント予約を開始）

  カートIDと配送先IDだけを受け取る。金額も送料もクライアントから渡させない。
  **ここで初めて在庫を引き当てる**（TTL 15 分）。届け先が決まって初めて送料が
  確定し、カートの「800円〜」が確定額になる。

  **引当は全部取れるか 1 つも取らないかにする。** 3 行のうち 2 行だけ
  引き当てた状態で「在庫不足です」と返すと、その 2 行は 15 分ほかの人が
  買えないまま残る。途中で失敗したら、それまでに取った分をその場で解放する。

  有効期限は DB が入れた値（0003 の既定値）をそのまま返す。アプリ側で
  `now + 15 分` と計算しない。両方で計算すると案内と実際の期限がずれる。

  注文の作成はまだ行わない（フェーズ3 の Stripe 接続と一緒に入る）。

• POST /api/market/orders（注文の確定。カートIDと配送先IDだけを受け取る）

  金額も送料もクライアントから渡させず、サーバーで引き直す。購入手続きの
  プレビューで出した値も使い回さない。画面を経由して戻ってきた値は、元が
  サーバー由来でもクライアント由来と同じ扱いにする。

  **注文は `pending` で作られる。** `paid` へは Stripe の通知でしか進まない。
  確保が切れたまま残った注文は、引当解放バッチが取消にする（下記）。

  引当が切れていたら注文を作らず `reservation_expired` を返す。購入手続きを
  始めてから 15 分を超えると在庫は戻っているので、そのまま成立させると
  在庫を確保していない注文ができる。

• GET /api/market/orders/{id}

  未実装。注文一覧（`/orders`）・注文詳細（`/orders/{id}`）はサーバー側で
  描画し、RLS 越しに直接読むため、ブラウザから叩く API を必要としない。

• GET /api/market/orders/{id}/receipt

• POST /api/market/orders/{id}/cancel-request

  **決済前（`pending`）はその場で取り消す。** まだお金が動いておらず、
  テナントの承諾を待つあいだ在庫が押さえられたままになる。
  決済後（`paid`）は申請にとどめ、テナントが判断する（発送の準備が
  始まっている可能性があり、返金も伴う）。申請の受け皿は返金の設計
  （フェーズ3-6）と一緒に作る。いまは監査ログに残す。

• POST /api/market/orders/{id}/return-request

## 9.2 テナントAPI

• POST /tenant/api/application

• POST /tenant/api/onboarding/stripe（連結アカウント作成・オンボーディングリンク発行）

• PUT /tenant/api/store（店舗情報。1テナント1件なので upsert）

• PUT /tenant/api/legal-profile（特定商取引法に基づく表記。同上）

• PUT /tenant/api/shipping（送料・発送日数。1テナント1件なので upsert）

  `regionRules` で地域別送料を保存する（docs/03 の形）。送られてこなければ
  地域別なしとして保存する。既存のルールを残さないのは、画面から全部消したのか
  項目ごと送られていないのかを区別できないため（SKU の一括保存と同じ）。
  形はアプリ（`lib/shipping/region.ts`）と 0012 の検査制約の両方が見る。

• POST /tenant/api/inquiries/{id}/messages（購入者への返信）

  返信すると 0014 のトリガが状態を「回答済み」へ移す。API から状態を書かない。
  2 か所で書くと、片方だけ成功したときに一覧の並びが狂う。

• POST /tenant/api/inquiries/{id}

  `action` で `close`（完了にする）と `reopen`（再開する）を指定する。閉じられるのは
  テナントだけ。返答の要否を判断するのは店側で、購入者が返信をやめたスレッドは
  未回答のまま一覧に残り、店側が気づいて閉じられる。

  読んだときの状態と書くときの状態が同じ場合だけ更新する（商品審査と同じ形）。
  0 件更新なら `invalid_transition` を返してやり直させる。

• POST /tenant/api/products（本体のみ。画像は `<tenant_id>/<product_id>/...` に置くため、商品IDが決まってから登録する）

• PATCH /tenant/api/products/{id}（本体。公開中の商品の本文を直すと審査待ちへ戻る）

  本体には販売形態（`pricingMode`）を含む。公開中の「1,000円」を「価格はお問い合わせ
  ください」へ黙って差し替えられると、承認した内容と見え方が変わるため、本文と同じく
  審査待ちへ戻す。省略すると `fixed`。

• PUT /tenant/api/products/{id}/variants（SKU・価格・在庫の一括保存。送られてこなかった既存行は削除）

• POST /tenant/api/products/{id}/images（Storage へ上げ終わった画像の登録。実体はブラウザから直接 Storage へ）

• DELETE /tenant/api/products/{id}/images/{imageId}

• POST /tenant/api/products/{id}/submit（審査に出す）

• DELETE /tenant/api/products/{id}/submit（提出の取り下げ。審査待ちのあいだだけ）

• GET /tenant/api/orders

  未実装。受注一覧・詳細はサーバー側で描画する（購入者面と同じ理由）。

• POST /tenant/api/orders/{id}/ship（発送登録）

  配送業者と追跡番号はどちらも任意。ネコポスや定形外など追跡の無い方法が
  あり、必須にすると発送登録そのものができなくなる。

  状態（`paid` → `shipped`）と `shipments` の記録は 0015 の `ship_order()`
  がまとめて書く。**アプリから 2 回に分けない。** 片方だけ成功すると
  「発送済みなのに記録が無い」注文ができ、`shipped_at` を起点にする
  ポイント確定（発送登録日＋14日）が出せなくなる。

  読んだときの状態を条件に書くので、2 人の担当者が同時に押しても
  二重に登録されない。

• POST /tenant/api/orders/{id}/cancel（テナント都合）

  発送前だけ。発送後は返金の扱いになる。**理由が必須。** 店の都合で止める
  以上、購入者に伝える言葉が要る（商品の差戻しと同じ判断）。
  確保していた在庫はその場で解放する。

• POST /tenant/api/returns/{id}/decision

• GET /tenant/api/settlements

## 9.3 本部API

• POST /admin/api/tenants/{id}/review

  `action` で状態遷移を指定する。

  | action | 遷移 | 権限 |
  |---|---|---|
  | `start_review` | applied / rejected → under_review | 本部オペレーター以上 |
  | `approve` | under_review → approved | 本部オペレーター以上 |
  | `reject` | under_review → rejected | 本部オペレーター以上 |
  | `suspend` | approved → suspended | 本部管理者のみ |
  | `reinstate` | suspended → approved | 本部管理者のみ |

  停止と復帰を本部管理者に限るのは docs/00 5.4 の権限表による
  （オペレーターはルール変更・精算確定・手動調整が不可）。

• POST /admin/api/products/{id}/review

  `action` で状態遷移を指定する。

  | action | 遷移 | 権限 |
  |---|---|---|
  | `approve` | submitted → approved | 本部オペレーター以上 |
  | `reject` | submitted → rejected | 本部オペレーター以上 |
  | `suspend` | approved → suspended | 本部管理者のみ |
  | `reinstate` | suspended → approved | 本部管理者のみ |

  `reject` と `suspend` は `note`（理由）が必須。テナントの商品画面に
  そのまま表示され、監査ログにも残る。`reinstate` は理由を消す。

  読んだときの状態と書くときの状態が同じ場合だけ更新する。2 人の担当者が
  同時に開いていても、片方の判断が黙って消えない。

• POST /admin/api/categories、PUT /admin/api/categories/{id}

  商品カテゴリーの追加・更新（docs/00 5.3）。本部管理者のみ。削除は用意しない。
  商品から参照されているカテゴリーを消すと、どの棚にあった商品か分からなくなる。
  使わなくなったものは `is_active` を落とす。

• POST /admin/api/pages

  サイト共通ページの新規作成。本文は同時に 1 版目として保存する。本部管理者のみ。

• PUT /admin/api/pages/{id}

  サイト共通ページの保存。本文は必ず新しい版として積む。`publish` が真なら
  その版を公開版にする。本部管理者のみ。

• POST /admin/api/pages/{id}

  `action: "unpublish"` で公開を取り下げる。本文（版）は残る。本部管理者のみ。

公開側は API を持たず、`/legal/{slug}` のページが RLS 越しに直接読む。
公開していないページと版は匿名から読めない。

本部の機能範囲は docs/00 5.3 に定める。商品審査、カテゴリー管理、手数料率設定、
ポイント設定、手動付与・取消などの API は、各フェーズで実装する際にここへ追記する。

本部管理者には多要素認証を必須とする（docs/00 8.2）。

## 9.4 ポイントAPI

購入者面から呼ぶため `/api/...` に置く。

• GET /api/points/balance

• GET /api/points/history

• POST /api/points/quote

• POST /api/points/reservations

• POST /api/points/reservations/{id}/commit

• POST /api/points/reservations/{id}/release

• POST /api/internal/points/award-purchase

• POST /api/internal/points/reverse-purchase

• POST /api/internal/points/confirm-pending（バッチ）

• POST /api/internal/points/expire（バッチ）

## 9.4.1 バッチ（Vercel Cron）

• GET /api/cron/release-reservations

  期限切れの在庫引当を解放する（docs/06 4.2）。5 分ごと。
  `Authorization: Bearer <CRON_SECRET>` で照合する。冪等。

  **このバッチが遅れても売り過ぎは起きない。** 引当の直前に、その SKU の
  期限切れをその場で解放しているため（0011 `release_expired_for_variant`）。
  ここは後片付けであって、正しさの担保ではない。

  **確保が切れた「決済待ち」の注文を取消にするところまで行う**
  （0015 `expire_pending_orders()`、2026-09-19 決定）。決済が繋がるまで
  注文は `pending` のまま動かず、放っておくと購入者の注文一覧に永久に
  決済待ちの行が並ぶ。判定は「有効な引当が 1 つも無いこと」。経過時間で
  切ると TTL の値がここにも書かれ、定義が 2 か所になる。

  別の Cron に分けないのは、畳む判定が引当の有無で決まるため。2 本に
  分けると実行の間隔ぶんだけ判定がずれる。**解放してから畳む**（順序を
  逆にすると、その回で切れた引当がまだ有効に見えて 1 周遅れる）。

  決済を繋いだら「決済処理中」の除外が要る。PaymentIntent が進行中の
  注文を畳むと、支払い済みなのに取消の注文が残る。

## 9.5 決済 内部API

• POST /api/webhooks/stripe

• POST /api/internal/refunds/{id}/execute

• POST /api/internal/disputes/{id}/reverse-transfer

• POST /api/internal/payouts/run

Stripe Webhookは署名を検証し、イベントIDで重複処理を防止する。内部APIはサービス間認証、権限確認、重複処理防止キーを必須とする。
