-- 一般物販マーケット 初期スキーマ
-- 出典：実装計画 v1.4 第7章
-- 方針：ポイント台帳は追記専用。残高は台帳の集計から算出する。

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM
-- ============================================================
create type tenant_status        as enum ('applied','under_review','approved','suspended','rejected');
create type product_status       as enum ('draft','submitted','approved','rejected','suspended');
create type order_status         as enum ('pending','paid','shipped','completed','cancelled','refunded','partially_refunded');
create type payment_status       as enum ('requires_payment','succeeded','failed','refunded','partially_refunded');
create type settlement_status    as enum ('scheduled','confirmed','paid','held');
create type point_entry_type     as enum ('earn_pending','earn_confirmed','spend','spend_refund','earn_reversal','expire','adjustment');
create type point_lot_status     as enum ('pending','available','exhausted','expired','reversed');
create type point_reservation_status as enum ('active','committed','released','expired');
create type point_usage_alloc_status as enum ('reserved','committed','released');
create type funding_source_type  as enum ('headquarters','tenant');

-- ============================================================
-- テナント
-- ============================================================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status tenant_status not null default 'applied',
  stripe_account_id text unique,                 -- Express アカウント
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  fee_rate numeric(5,4) not null default 0.1000, -- 販売手数料率
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,                          -- auth.users.id
  role text not null check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table tenant_legal_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  legal_name text not null,
  representative_name text not null,
  address text not null,
  phone text not null,
  email text not null,
  invoice_registration_number text,               -- 適格請求書登録番号
  return_policy text,
  updated_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  description text,
  logo_path text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 商品・在庫
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  description text,
  category_id uuid,
  status product_status not null default 'draft',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (tenant_id, status);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null,
  option_label text,
  price_incl_tax integer not null check (price_incl_tax >= 0), -- 円・税込
  tax_rate numeric(4,3) not null default 0.100,
  is_active boolean not null default true,
  unique (product_id, sku)
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0
);

create table inventories (
  variant_id uuid primary key references product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0)
);

-- 購入手続き中の在庫引当（TTL 15分）
create table inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  cart_id uuid,
  order_id uuid,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index on inventory_reservations (expires_at) where released_at is null;

create table shipping_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  base_fee integer not null default 0,
  free_threshold integer,
  lead_time_days integer not null default 3,
  region_rules jsonb not null default '{}'::jsonb
);

-- ============================================================
-- カート・注文
-- ============================================================
create table carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null,
  tenant_id uuid not null references tenants(id),   -- 1カート1テナント
  created_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity integer not null check (quantity > 0),
  unique (cart_id, variant_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_id uuid not null,
  tenant_id uuid not null references tenants(id),
  status order_status not null default 'pending',
  subtotal_incl_tax integer not null,      -- 商品代合計（税込）
  shipping_fee integer not null default 0,
  point_discount integer not null default 0,
  total_charged integer not null,          -- 実際の円決済額
  -- 注文時点のポイントルールを保存（遡及適用禁止）
  point_rule_snapshot jsonb not null default '{}'::jsonb,
  shipping_address jsonb not null,
  placed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (tenant_id, status);
create index on orders (buyer_id, created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  product_title text not null,             -- 注文時点の名称を保存
  unit_price_incl_tax integer not null,
  quantity integer not null check (quantity > 0),
  line_total_incl_tax integer not null,
  point_eligible_amount integer not null,  -- 付与対象額（送料・ポイント値引き除く）
  allocated_point_discount integer not null default 0, -- 最大剰余方式で配分
  refunded_quantity integer not null default 0
);
create index on order_items (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  status payment_status not null default 'requires_payment',
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_transfer_id text,
  application_fee_amount integer,
  on_behalf_of text,                        -- テナントの Stripe アカウントID
  amount integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  carrier text,
  tracking_number text,
  shipped_at timestamptz not null,          -- ポイント確定（+14日）の起点
  created_at timestamptz not null default now()
);
create index on shipments (shipped_at);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  stripe_refund_id text unique,
  amount integer not null,
  reason text not null check (reason in ('buyer_request','tenant_fault','defect','mis_delivery','other')),
  reverse_transfer boolean not null default true,
  refund_application_fee boolean not null default true,
  stripe_fee_bearer text not null check (stripe_fee_bearer in ('headquarters','tenant')),
  created_at timestamptz not null default now()
);

create table refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  order_item_id uuid not null references order_items(id),
  quantity integer not null check (quantity > 0),
  amount integer not null
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  stripe_dispute_id text unique not null,
  amount integer not null,
  fee integer not null default 0,
  evidence_due_by timestamptz,
  status text not null,
  recovered_from_tenant boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 精算
-- ============================================================
create table marketplace_fee_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade, -- null なら既定値
  fee_rate numeric(5,4) not null,
  effective_from date not null,
  created_at timestamptz not null default now()
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  period_start date not null,
  period_end date not null,
  status settlement_status not null default 'scheduled',
  gross_sales integer not null default 0,
  shipping_total integer not null default 0,
  fee_total integer not null default 0,
  refund_total integer not null default 0,
  stripe_fee_charged integer not null default 0,
  point_burden_tenant integer not null default 0,   -- テナント負担分（控除）
  point_compensation_hq integer not null default 0, -- 本部負担分（補填）
  payout_amount integer not null default 0,
  stripe_payout_id text,
  confirmed_at timestamptz,
  paid_at timestamptz,
  unique (tenant_id, period_start, period_end)
);

create table settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  order_id uuid references orders(id),
  kind text not null,  -- sale / shipping / fee / refund / stripe_fee / point_burden / point_compensation / dispute
  amount integer not null,
  note text
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  issuer_tenant_id uuid not null references tenants(id),  -- 発行者はテナント
  issued_on_behalf boolean not null default true,         -- 本部が代行発行
  invoice_registration_number text,
  document_path text,
  issued_at timestamptz not null default now()
);

-- ============================================================
-- ポイント
-- ============================================================
create table point_accounts (
  buyer_id uuid primary key,
  created_at timestamptz not null default now()
);

create table point_funding_sources (
  id uuid primary key default gen_random_uuid(),
  source_type funding_source_type not null,
  tenant_id uuid references tenants(id),
  label text not null,
  check ((source_type = 'tenant') = (tenant_id is not null))
);

create table point_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('base','product','store','campaign')),
  target_id uuid,
  rate numeric(5,4) not null,
  usage_cap_ratio numeric(4,3) not null default 0.500,  -- 注文金額の50%
  confirm_after_days integer not null default 14,
  expire_after_months integer not null default 12,
  funding_source_id uuid references point_funding_sources(id),
  effective_from timestamptz not null default now(),
  effective_to timestamptz
);

create table point_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_id uuid not null references point_rules(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  monthly_cap integer,             -- 到達で上乗せ付与停止
  is_active boolean not null default true
);

-- 基本還元は警告のみ（停止しない）／キャンペーンはハード上限
create table point_issuance_budgets (
  id uuid primary key default gen_random_uuid(),
  year_month date not null,
  kind text not null check (kind in ('base_reward_warning','campaign_cap')),
  campaign_id uuid references point_campaigns(id),
  limit_points integer not null,
  issued_points integer not null default 0,
  reached_at timestamptz,
  unique (year_month, kind, campaign_id)
);

-- 付与ロット（有効期限・残量の管理単位）
create table point_lots (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references point_accounts(buyer_id),
  order_id uuid references orders(id),
  order_item_id uuid references order_items(id),
  funding_source_id uuid references point_funding_sources(id),
  status point_lot_status not null default 'pending',
  granted_points integer not null check (granted_points >= 0),
  remaining_points integer not null check (remaining_points >= 0),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (remaining_points <= granted_points)
);
create index on point_lots (buyer_id, status, expires_at);  -- FIFO 消費用

-- 追記専用の増減台帳
create table point_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references point_accounts(buyer_id),
  entry_type point_entry_type not null,
  delta integer not null,                    -- 増加は正、減少は負
  lot_id uuid references point_lots(id),
  order_id uuid references orders(id),
  order_item_id uuid references order_items(id),
  funding_source_id uuid references point_funding_sources(id),
  reversal_of uuid references point_ledger_entries(id),
  reason text not null,
  actor_id uuid,                             -- 手動調整の実行者
  idempotency_key text not null unique,      -- order_item_id + entry_type + sequence
  occurred_at timestamptz not null default now()
);
create index on point_ledger_entries (buyer_id, occurred_at);
create index on point_ledger_entries (order_id);

-- 台帳は追記専用（UPDATE / DELETE を禁止）
create or replace function point_ledger_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'point_ledger_entries is append-only. Add a reversing entry instead.';
end $$;

create trigger point_ledger_no_update before update on point_ledger_entries
  for each row execute function point_ledger_append_only();
create trigger point_ledger_no_delete before delete on point_ledger_entries
  for each row execute function point_ledger_append_only();

-- 決済中の一時確保（TTL 15分）
create table point_reservations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references point_accounts(buyer_id),
  order_id uuid references orders(id),
  points integer not null check (points > 0),
  status point_reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on point_reservations (expires_at) where status = 'active';

-- 予約時に作成し、確定・解除で状態を変える（予約用と確定用を分けない）
create table point_usage_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references point_reservations(id) on delete cascade,
  order_id uuid references orders(id),
  order_item_id uuid references order_items(id),
  lot_id uuid not null references point_lots(id),
  points integer not null check (points > 0),
  status point_usage_alloc_status not null default 'reserved',
  refunded_points integer not null default 0,
  created_at timestamptz not null default now()
);
create index on point_usage_allocations (order_id, status);
create index on point_usage_allocations (lot_id);

create table point_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references point_accounts(buyer_id),
  points integer not null,
  reason text not null,
  requested_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  ledger_entry_id uuid references point_ledger_entries(id),
  created_at timestamptz not null default now()
);

-- 残高は台帳の集計から算出する（残高カラムは持たない）
create view point_balances as
select buyer_id,
       coalesce(sum(delta) filter (where entry_type <> 'earn_pending'), 0) as available_points,
       coalesce(sum(delta) filter (where entry_type = 'earn_pending'), 0)  as pending_points
from point_ledger_entries
group by buyer_id;

-- ============================================================
-- 監査
-- ============================================================
create table audit_logs (
  id bigserial primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index on audit_logs (target_table, target_id);
create index on audit_logs (created_at desc);
