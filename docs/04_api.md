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

• POST /api/market/cart/items

• POST /api/market/checkout/preview（在庫引当・ポイント予約を開始）

• POST /api/market/orders

• GET /api/market/orders/{id}

• GET /api/market/orders/{id}/receipt

• POST /api/market/orders/{id}/cancel-request

• POST /api/market/orders/{id}/return-request

## 9.2 テナントAPI

• POST /tenant/api/application

• POST /tenant/api/onboarding/stripe（連結アカウント作成・オンボーディングリンク発行）

• PUT /tenant/api/store（店舗情報。1テナント1件なので upsert）

• PUT /tenant/api/legal-profile（特定商取引法に基づく表記。同上）

• POST /tenant/api/products

• PATCH /tenant/api/products/{id}

• POST /tenant/api/products/{id}/submit

• GET /tenant/api/orders

• POST /tenant/api/orders/{id}/ship

• POST /tenant/api/orders/{id}/cancel（テナント都合）

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

## 9.5 決済 内部API

• POST /api/webhooks/stripe

• POST /api/internal/refunds/{id}/execute

• POST /api/internal/disputes/{id}/reverse-transfer

• POST /api/internal/payouts/run

Stripe Webhookは署名を検証し、イベントIDで重複処理を防止する。内部APIはサービス間認証、権限確認、重複処理防止キーを必須とする。
