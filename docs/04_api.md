# 04 API設計

出典：v1.4 9章

# 9 API案

名称は実装時に決定するAPI命名規約へ合わせて調整する。

## 公開 購入者API

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

## テナントAPI

• POST /api/tenant/application

• POST /api/tenant/onboarding/stripe（連結アカウント作成・オンボーディングリンク発行）

• POST /api/tenant/products

• PATCH /api/tenant/products/{id}

• POST /api/tenant/products/{id}/submit

• GET /api/tenant/orders

• POST /api/tenant/orders/{id}/ship

• POST /api/tenant/orders/{id}/cancel（テナント都合）

• POST /api/tenant/returns/{id}/decision

• GET /api/tenant/settlements

## ポイントAPI

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

## 決済 内部API

• POST /api/webhooks/stripe

• POST /api/internal/refunds/{id}/execute

• POST /api/internal/disputes/{id}/reverse-transfer

• POST /api/internal/payouts/run

Stripe Webhookは署名を検証し、イベントIDで重複処理を防止する。内部APIはサービス間認証、権限確認、重複処理防止キーを必須とする。
