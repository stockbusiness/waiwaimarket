-- 0016 ポイントの初期ルールと負担元（フェーズ4-1・4-7）
-- 出典：docs/02 4.4・6.1、docs/06 フェーズ4
--
-- `point_rules` も `point_funding_sources` も空のままだった。決済を繋いでも
-- 「何％付与するか」が決まっていないので付与できない。docs/02 6.1 の初期値を
-- 入れ、本部が画面から変えられるようにする。
--
-- **付与そのものはまだ走らない。** 付与の起点は決済成功（docs/02 6.3 の 5→7）で、
-- Stripe が未接続のため注文は `pending` から動かない。台帳への書き込みと
-- 確定・失効バッチは決済を繋ぐときに入れる。

-- ============================================================
-- 1. 負担元
-- ============================================================
-- docs/02 4.4 の負担区分のうち、初期に要るのは本部だけ。
-- テナント負担（上乗せ）はテナントごとに 1 行を作るので、出店時に足す。
insert into point_funding_sources (id, source_type, tenant_id, label)
values ('f0000000-0000-4000-9000-000000000001', 'headquarters', null,
        'マーケット運営本部')
on conflict (id) do nothing;

-- ============================================================
-- 2. 基本還元ルール
-- ============================================================
-- docs/02 6.1 の初期値。
--
--   還元率     税込商品代金の 1%      rate = 0.0100
--   利用上限   商品代金の 50%         usage_cap_ratio = 0.500
--   確定時期   発送登録日 + 14 日     confirm_after_days = 14
--   有効期限   付与日から 12 か月     expire_after_months = 12
--
-- **`rate` は numeric(5,4)、`usage_cap_ratio` は numeric(4,3)。**
-- どちらも 2 進の浮動小数を経由しない型で、万分率の整数へ誤差なく直せる
-- （docs/02 6.1、`lib/points/rules.ts` の `parseRatio()` が文字列のまま読む）。
insert into point_rules (
  id, scope, target_id, rate, usage_cap_ratio,
  confirm_after_days, expire_after_months, funding_source_id, effective_from
)
values ('f1000000-0000-4000-9000-000000000001', 'base', null, 0.0100, 0.500,
        14, 12, 'f0000000-0000-4000-9000-000000000001', now())
on conflict (id) do nothing;

-- ============================================================
-- 3. 基本ルールは同時に 1 本だけ
-- ============================================================
-- **ルールは上書きせず版として積む**（docs/02 6.1「変更は既存注文へ遡及適用
-- せず、注文確定時のルールを保存する」）。変更のたびに新しい行を足し、
-- 前の行に `effective_to` を入れて閉じる。
--
-- 上書きにすると、過去の注文が「いま何％だったか」を復元できなくなる。
-- 注文側にも `orders.point_rule_snapshot` へ写し取るが、**2 か所で持つのは
-- 意図したもの**。スナップショットは注文の証跡、こちらは制度の履歴。
--
-- 有効期間が重なった基本ルールが 2 本あると、どちらで付与したのか決まらない。
-- 部分一意索引で「閉じていない基本ルール」を 1 本に保つ
-- （0013 の既定配送先と同じ形。アプリ側で「前を閉じてから足す」と書くと、
-- その隙間で 2 本開く）。
create unique index point_rules_one_open_base
  on point_rules (scope)
  where scope = 'base' and effective_to is null;

comment on index point_rules_one_open_base is
  '有効期間が開いている基本ルールは 1 本だけ。更新は前を閉じてから足す（先に閉じること）。';

-- ============================================================
-- 4. 値の妥当性は 0003 がすでに押さえている
-- ============================================================
-- ここで検査制約を足そうとして `already exists` で落とした。0003 の 196 行に
-- 同じものがある。**足す前に既存を読むこと。**
--
--   rate            0 以上 1 以下            point_rules_rate_range
--   usage_cap_ratio 0 より大きく 1 以下      point_rules_usage_cap_range
--   confirm_after_days >= 0、expire_after_months > 0
--                                            point_rules_positive_periods
--   effective_to    null か effective_from より後
--                                            point_rules_effective_range
--   scope='base' のときだけ target_id が null
--                                            point_rules_target_matches_scope
--
-- **利用上限は 0 を許さない**（`> 0`）。0 にするとポイントを一切使えない
-- ルールになり、「利用停止」を上限の値で表すことになる。止めるなら
-- ルールごと閉じる。
--
-- 上限を 100% にできる点は 0003 のままにしてある。そのとき円決済が 0 円に
-- なりうるが、`lib/points/spend.ts` の `checkSpend()` が
-- `no_cash_remaining` で弾く（0003 の `orders_charge_positive` と揃えてある）。
