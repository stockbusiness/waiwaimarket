# 07 Claude Code 実行手順

上から順に実行する。1セッション1フェーズ。
各フェーズの完了条件は docs/06_phases.md を参照。

---

## 事前準備

```bash
npx create-next-app@latest . --typescript --app --tailwind
npm i @supabase/supabase-js stripe zod
npm i -D vitest @types/node
npx supabase init && npx supabase link --project-ref <ref>
```

`.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # サーバー専用
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
```

---

## ステップ1：スキーマ適用

```
supabase/migrations/ の 0001_init.sql と 0002_rls.sql を確認し、
docs/03_data_model.md と docs/02_points.md の仕様を満たしているか
検証してください。不足があれば 0003_ 以降の追加マイグレーションとして
提案してください。既存ファイルは書き換えないでください。
```

確認後：`npx supabase db push`

---

## ステップ2：型と共通基盤

```
Supabase から型を生成し、以下を実装してください。
- lib/supabase/server.ts（service_role 用、サーバー専用）
- lib/supabase/client.ts（anon 用）
- lib/auth/roles.ts（購入者/テナント管理者/テナント担当者/
  本部管理者/本部オペレーターの判定と、API 用の認可ヘルパー）
- lib/audit.ts（監査ログ記録）

CLAUDE.md の「絶対に守るルール」を満たすこと。
まず計画を出してください。
```

---

## ステップ3：フェーズ1（共通基盤・テナント管理）

```
docs/06_phases.md の「フェーズ1」を実装します。
参照：docs/00_overview.md（5.4 権限）、docs/01_payments.md（オンボーディング）

含めるもの：
- メール認証によるマーケット会員登録・ログイン
- 出店申請 → 審査 → 承認 / 停止
- Stripe Connect Express アカウント作成とオンボーディングリンク発行
- 店舗ページ、特商法情報
- 監査ログ、本部管理者の多要素認証

注意：Stripe オンボーディング完了だけで承認しない。
本部の事業者審査も通過して初めて出品可能にすること。

まず実装計画を出してください。
```

---

## ステップ4：フェーズ2（商品・在庫・公開画面）

```
docs/06_phases.md の「フェーズ2」を実装します。

在庫引当は checkout 開始時、TTL 15分。カート投入時は引当しない。
同時購入で在庫超過が起きないこと（行ロックまたは条件付き UPDATE）。
引当解放のバッチは冪等にすること。

まず実装計画を出してください。
```

---

## ステップ5：フェーズ3（決済）

```
docs/01_payments.md を読んでから実装します。

Stripe の destination charges、on_behalf_of、reverse_transfer、
refund_application_fee、debit_negative_balances の最新仕様を
公式ドキュメントで確認してから着手してください。

構成：
- lib/payments/stripe-adapter.ts に Stripe 固有処理を閉じる
- app/api/webhooks/stripe/route.ts は署名検証 + イベントID重複防止
- 注文ロジックから Stripe SDK を直接呼ばないこと

まず実装計画を出してください。
```

---

## ステップ6：フェーズ4（ポイント）— テスト先行

セッション1：

```
docs/05_test_cases.md の「ポイント」の全項目を、
vitest の実行可能なテストとして書いてください。
実装はまだ書かないでください。テストは当然すべて失敗して構いません。

特に以下は必ず含めること：
- 同一決済通知を複数回送っても二重付与されない
- 部分返品時に明細単位で正しく再計算される
- point_usage_allocations から元ロット・期限・明細別使用数を再現できる
- 期限の近いロットから消費される
- 確定バッチ・失効バッチの二重実行で結果が変わらない
```

セッション2：

```
先に書いたテストを通す実装を lib/points/ に作ってください。
docs/02_points.md の 6.1〜6.5 が仕様です。

最大剰余方式の配分は純関数として切り出し、
同じ入力で必ず同じ出力になるようにしてください。
```

このフェーズは `/model opus` を推奨。

---

## ステップ7：フェーズ5（精算）

```
docs/06_phases.md の「フェーズ5」を実装します。

精算明細に含める区分：商品代、送料、販売手数料、Stripe決済手数料、
返金、チャージバック、ポイント負担（テナント）、ポイント補填（本部）。

完了条件は「注文合計と決済・返金・ポイント・手数料・振込額が一致」。
この一致を検証するテストも書いてください。

まず実装計画を出してください。
```

---

## 各フェーズ完了時に必ず実行

```
今回の実装で判明した制約、ハマりどころ、設計判断を
CLAUDE.md の「実装済み」セクションに簡潔に追記してください。
次のセッションで同じ調査を繰り返さないための記録です。
```

---

## 効率化のヒント

- 仕様確認だけのセッションは Sonnet、設計とポイントロジックは Opus。
- 「まず計画を出す」を毎回入れる。計画段階で仕様違反を潰すのが最も安い。
- docs/ を書き換えたくなったら、コードではなく先に docs を直す。
  docs が正であることを崩さない。
