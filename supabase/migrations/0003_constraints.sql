-- 0003 制約・インデックスの補完
-- 目的：docs で明記されている規則を DB 側でも強制する。
--   docs/02_points.md 6.1 / 6.2 / 6.3 / 6.5
--   docs/03_data_model.md 7.2
--   docs/06_phases.md フェーズ2・4 完了条件
-- 既存ファイル（0001 / 0002）は書き換えず、差分のみをここへ追加する。

-- ============================================================
-- 1. 在庫（フェーズ2完了条件：在庫超過販売を発生させない）
-- ============================================================
-- 引当数が実在庫を超えないこと。0001 では各列の >= 0 のみで、
-- reserved <= quantity が担保されていなかった。
alter table inventories
  add constraint inventories_reserved_within_stock
  check (reserved_quantity <= quantity);

-- 在庫引当の TTL は 15 分（docs/06 4.2、CLAUDE.md 全般ルール）。
alter table inventory_reservations
  alter column expires_at set default (now() + interval '15 minutes');

alter table inventory_reservations
  add constraint inventory_reservations_ttl_forward
  check (expires_at > created_at);

-- 引当の対象は必ずカートか注文のいずれかに紐づく。
alter table inventory_reservations
  add constraint inventory_reservations_owner_present
  check (cart_id is not null or order_id is not null);

create index if not exists inventory_reservations_variant_active_idx
  on inventory_reservations (variant_id) where released_at is null;

-- 1購入者 1テナント 1カート（docs/06 4.2「1回の決済につき1テナント」）
create unique index if not exists carts_buyer_tenant_uniq
  on carts (buyer_id, tenant_id);

-- ============================================================
-- 2. 注文金額（サーバー側再計算の結果が壊れていないこと）
-- ============================================================
-- 全額ポイント購入は不可（docs/02 6.1 利用上限）。円決済額は必ず 1 円以上。
-- 上限比率（初期 50%）は point_rules.usage_cap_ratio で可変のため
-- ここではハードコードせず、比率は API 側で検証する。
alter table orders
  add constraint orders_amounts_non_negative
  check (subtotal_incl_tax >= 0 and shipping_fee >= 0 and point_discount >= 0),
  add constraint orders_charge_positive
  check (total_charged > 0),
  add constraint orders_total_consistent
  check (total_charged = subtotal_incl_tax + shipping_fee - point_discount),
  add constraint orders_point_discount_within_subtotal
  check (point_discount <= subtotal_incl_tax);

alter table order_items
  add constraint order_items_line_total_consistent
  check (line_total_incl_tax = unit_price_incl_tax * quantity),
  add constraint order_items_refunded_within_quantity
  check (refunded_quantity >= 0 and refunded_quantity <= quantity),
  add constraint order_items_point_eligible_within_line
  check (point_eligible_amount >= 0 and point_eligible_amount <= line_total_incl_tax),
  add constraint order_items_allocated_discount_within_line
  check (allocated_point_discount >= 0 and allocated_point_discount <= line_total_incl_tax);

-- 返金明細は元注文明細の数量を超えない（数量チェックは API 側で合算検証）。
alter table refunds
  add constraint refunds_amount_positive check (amount > 0);

alter table refund_items
  add constraint refund_items_amount_positive check (amount > 0);

create index if not exists refund_items_order_item_idx on refund_items (order_item_id);
create index if not exists refunds_order_idx on refunds (order_id);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists shipments_order_idx on shipments (order_id);
create index if not exists receipts_order_idx on receipts (order_id);
create index if not exists settlement_items_settlement_idx on settlement_items (settlement_id);

-- 精算明細の kind は 0001 のコメントどおりに限定する。
alter table settlement_items
  add constraint settlement_items_kind_allowed
  check (kind in ('sale','shipping','fee','refund','stripe_fee',
                  'point_burden','point_compensation','dispute'));

-- ============================================================
-- 3. ポイント台帳（docs/02 6.2、6.5）
-- ============================================================
-- entry_type ごとの符号を固定する。台帳の合計から残高を算出する前提のため、
-- 符号の取り違えは残高そのものを壊す。
alter table point_ledger_entries
  add constraint point_ledger_delta_sign
  check (
    case entry_type
      when 'earn_pending'   then delta > 0
      when 'earn_confirmed' then delta > 0
      when 'spend_refund'   then delta > 0
      when 'spend'          then delta < 0
      when 'expire'         then delta < 0
      when 'earn_reversal'  then delta < 0
      when 'adjustment'     then delta <> 0
    end
  );

-- 取消は必ず取消元を持つ（docs/03「取消元ID」）。
-- 付与予定の取消か確定済みの取消かを台帳だけで判別できるようにするため、
-- earn_reversal では reversal_of を必須にする。残高ビュー（0005）がこれを使う。
alter table point_ledger_entries
  add constraint point_ledger_reversal_requires_origin
  check ((entry_type = 'earn_reversal') = (reversal_of is not null));

-- 手動調整には実行者を必ず残す（docs/05 「管理者の手動変更に理由と実行者が残る」）。
alter table point_ledger_entries
  add constraint point_ledger_adjustment_requires_actor
  check (entry_type <> 'adjustment' or actor_id is not null);

alter table point_ledger_entries
  add constraint point_ledger_reason_not_blank
  check (length(btrim(reason)) > 0);

-- 台帳は追記専用。0001 は UPDATE / DELETE を止めているが TRUNCATE が素通りする。
create trigger point_ledger_no_truncate before truncate on point_ledger_entries
  for each statement execute function point_ledger_append_only();

create index if not exists point_ledger_lot_idx on point_ledger_entries (lot_id);
create index if not exists point_ledger_order_item_idx on point_ledger_entries (order_item_id);
create index if not exists point_ledger_reversal_of_idx on point_ledger_entries (reversal_of);

-- ============================================================
-- 4. 付与ロット（二重付与防止：docs/02 6.5、フェーズ4完了条件）
-- ============================================================
-- 0001 では台帳のみ idempotency_key を持ち、ロット側に重複防止がなかった。
-- 同一の決済通知が複数回届くとロットだけが二重に作られる。
alter table point_lots add column if not exists idempotency_key text;
create unique index if not exists point_lots_idempotency_key_uniq
  on point_lots (idempotency_key);

alter table point_lots
  add constraint point_lots_purchase_grant_requires_key
  check (order_item_id is null or idempotency_key is not null);

-- 注文時点の還元率と適用ルールを保存する（CLAUDE.md ポイント絶対ルール、
-- docs/02 6.3-7「注文時点の還元率・期限・負担者・計算結果を保存する」）。
-- 商品別・店舗別ルールがあるため orders.point_rule_snapshot（注文単位）だけでは
-- 明細ごとの適用率を再現できない。
alter table point_lots add column if not exists point_rule_id uuid references point_rules(id);
alter table point_lots add column if not exists applied_rate numeric(5,4);
alter table point_lots
  add constraint point_lots_purchase_grant_requires_rate
  check (order_item_id is null or applied_rate is not null);

comment on column point_lots.idempotency_key is
  '二重付与防止キー。購入付与は order_item_id + entry_type + sequence を基本とする。';
comment on column point_lots.applied_rate is
  '注文時点で適用した還元率。ルール変更を遡及適用しないためロットへ保存する。';

-- 有効期限は付与日以降。
alter table point_lots
  add constraint point_lots_expires_after_creation
  check (expires_at > created_at);

-- ============================================================
-- 5. ポイント予約・利用配分（docs/02 6.3、docs/05 ポイント）
-- ============================================================
-- ポイント予約の TTL も在庫引当と同じ 15 分。
alter table point_reservations
  alter column expires_at set default (now() + interval '15 minutes');

alter table point_reservations
  add constraint point_reservations_ttl_forward
  check (expires_at > created_at);

-- 1注文につき有効な予約は1件（二重予約による残高超過利用を防ぐ）。
create unique index if not exists point_reservations_active_order_uniq
  on point_reservations (order_id)
  where status = 'active' and order_id is not null;

create index if not exists point_reservations_buyer_status_idx
  on point_reservations (buyer_id, status);

-- 返還済みポイントは使用ポイントを超えない（docs/02 6.4 部分返品）。
alter table point_usage_allocations
  add constraint point_usage_alloc_refund_within_points
  check (refunded_points >= 0 and refunded_points <= points);

create index if not exists point_usage_alloc_reservation_idx
  on point_usage_allocations (reservation_id);
create index if not exists point_usage_alloc_order_item_idx
  on point_usage_allocations (order_item_id);

-- ============================================================
-- 6. ポイントルール・発行予算
-- ============================================================
-- 基本還元（scope='base'）は対象IDを持たない。それ以外は対象IDが必要。
alter table point_rules
  add constraint point_rules_target_matches_scope
  check ((scope = 'base') = (target_id is null));

alter table point_rules
  add constraint point_rules_rate_range check (rate >= 0 and rate <= 1),
  add constraint point_rules_usage_cap_range check (usage_cap_ratio > 0 and usage_cap_ratio <= 1),
  add constraint point_rules_positive_periods
  check (confirm_after_days >= 0 and expire_after_months > 0),
  add constraint point_rules_effective_range
  check (effective_to is null or effective_to > effective_from);

create index if not exists point_rules_scope_effective_idx
  on point_rules (scope, effective_from desc);

alter table point_campaigns
  add constraint point_campaigns_period_valid check (ends_at > starts_at),
  add constraint point_campaigns_cap_positive check (monthly_cap is null or monthly_cap > 0);

-- 0001 の unique (year_month, kind, campaign_id) は campaign_id が NULL のとき
-- 効かない（NULL は重複と見なされない）。基本還元の警告基準額は campaign_id が
-- NULL のため、同一年月に複数行を作れてしまう。部分一意インデックスで塞ぐ。
create unique index if not exists point_issuance_budgets_month_kind_nocampaign_uniq
  on point_issuance_budgets (year_month, kind)
  where campaign_id is null;

alter table point_issuance_budgets
  add constraint point_issuance_budgets_kind_matches_campaign
  check ((kind = 'campaign_cap') = (campaign_id is not null)),
  add constraint point_issuance_budgets_amounts
  check (limit_points >= 0 and issued_points >= 0),
  -- year_month は月初日で保存する。
  add constraint point_issuance_budgets_month_start
  check (date_trunc('month', year_month::timestamp)::date = year_month);

-- 手動調整の承認記録（docs/05「理由と実行者が残る」）。
alter table point_adjustment_requests
  add constraint point_adjustment_points_nonzero check (points <> 0),
  add constraint point_adjustment_reason_not_blank check (length(btrim(reason)) > 0),
  add constraint point_adjustment_approval_pairing
  check ((approved_by is null) = (approved_at is null)),
  -- 承認前に台帳へ反映しない。
  add constraint point_adjustment_ledger_after_approval
  check (ledger_entry_id is null or approved_at is not null);

-- ============================================================
-- 7. updated_at の自動更新
-- ============================================================
-- 0001 のトリガ関数も含め search_path を固定する（関数乗っ取り対策）。
alter function point_ledger_append_only() set search_path = public, pg_temp;

create or replace function set_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tenants_set_updated_at before update on tenants
  for each row execute function set_updated_at();
create trigger tenant_legal_profiles_set_updated_at before update on tenant_legal_profiles
  for each row execute function set_updated_at();
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();
create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();
create trigger payments_set_updated_at before update on payments
  for each row execute function set_updated_at();
