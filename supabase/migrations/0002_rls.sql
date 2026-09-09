-- RLS ポリシー
-- 方針：RLS だけで情報保護を保証しない。API 側でも必ず認可する（v1.4 8.2）。
-- ロール判定はアプリ側で発行する JWT クレームを前提とする。

-- ------------------------------------------------------------
-- ヘルパー
-- ------------------------------------------------------------
create or replace function auth_tenant_ids() returns setof uuid
language sql stable security definer as $$
  select tenant_id from tenant_members where user_id = auth.uid();
$$;

create or replace function is_hq_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'hq_admin';
$$;

create or replace function is_hq_operator() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('hq_admin','hq_operator');
$$;

-- テナント管理者のみ（担当者は精算・事業者情報を見られない）
create or replace function is_tenant_owner(t uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from tenant_members
    where user_id = auth.uid() and tenant_id = t and role = 'owner'
  );
$$;

-- ------------------------------------------------------------
-- 有効化
-- ------------------------------------------------------------
alter table tenants                enable row level security;
alter table tenant_members         enable row level security;
alter table tenant_legal_profiles  enable row level security;
alter table stores                 enable row level security;
alter table products               enable row level security;
alter table product_variants       enable row level security;
alter table product_images         enable row level security;
alter table inventories            enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table payments               enable row level security;
alter table shipments              enable row level security;
alter table refunds                enable row level security;
alter table disputes               enable row level security;
alter table settlements            enable row level security;
alter table settlement_items       enable row level security;
alter table receipts               enable row level security;
alter table point_accounts         enable row level security;
alter table point_lots             enable row level security;
alter table point_ledger_entries   enable row level security;
alter table point_reservations     enable row level security;
alter table point_usage_allocations enable row level security;
alter table point_adjustment_requests enable row level security;
alter table audit_logs             enable row level security;

-- ------------------------------------------------------------
-- 公開（未ログインでも閲覧可）：承認済み商品と公開店舗のみ
-- ------------------------------------------------------------
create policy products_public_read on products for select
  using (status = 'approved');

create policy variants_public_read on product_variants for select
  using (exists (select 1 from products p where p.id = product_id and p.status = 'approved'));

create policy images_public_read on product_images for select
  using (exists (select 1 from products p where p.id = product_id and p.status = 'approved'));

create policy stores_public_read on stores for select
  using (is_public = true);

-- ------------------------------------------------------------
-- テナント：自店舗のみ
-- ------------------------------------------------------------
create policy products_tenant_all on products for all
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));

create policy orders_tenant_read on orders for select
  using (tenant_id in (select auth_tenant_ids()));

create policy order_items_tenant_read on order_items for select
  using (exists (select 1 from orders o
                 where o.id = order_id and o.tenant_id in (select auth_tenant_ids())));

create policy shipments_tenant_all on shipments for all
  using (exists (select 1 from orders o
                 where o.id = order_id and o.tenant_id in (select auth_tenant_ids())))
  with check (exists (select 1 from orders o
                 where o.id = order_id and o.tenant_id in (select auth_tenant_ids())));

-- 精算・事業者情報はテナント管理者のみ
create policy settlements_owner_read on settlements for select
  using (is_tenant_owner(tenant_id));

create policy legal_owner_all on tenant_legal_profiles for all
  using (is_tenant_owner(tenant_id))
  with check (is_tenant_owner(tenant_id));

-- ------------------------------------------------------------
-- 購入者：自分のもののみ
-- ------------------------------------------------------------
create policy orders_buyer_read on orders for select
  using (buyer_id = auth.uid());

create policy order_items_buyer_read on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));

create policy point_account_self on point_accounts for select
  using (buyer_id = auth.uid());

create policy point_lots_self on point_lots for select
  using (buyer_id = auth.uid());

create policy point_ledger_self on point_ledger_entries for select
  using (buyer_id = auth.uid());

create policy point_reservations_self on point_reservations for select
  using (buyer_id = auth.uid());

create policy receipts_buyer_read on receipts for select
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));

-- ------------------------------------------------------------
-- 本部
-- ------------------------------------------------------------
create policy hq_read_tenants     on tenants     for select using (is_hq_operator());
create policy hq_write_tenants    on tenants     for all    using (is_hq_admin()) with check (is_hq_admin());
create policy hq_read_orders      on orders      for select using (is_hq_operator());
create policy hq_read_payments    on payments    for select using (is_hq_operator());
create policy hq_read_refunds     on refunds     for select using (is_hq_operator());
create policy hq_read_disputes    on disputes    for select using (is_hq_operator());
create policy hq_read_products    on products    for select using (is_hq_operator());
create policy hq_read_ledger      on point_ledger_entries for select using (is_hq_operator());
create policy hq_read_lots        on point_lots  for select using (is_hq_operator());
create policy hq_read_audit       on audit_logs  for select using (is_hq_operator());

-- 精算確定・手動調整は本部管理者のみ
create policy hq_admin_settlements on settlements for all
  using (is_hq_admin()) with check (is_hq_admin());
create policy hq_admin_adjustments on point_adjustment_requests for all
  using (is_hq_admin()) with check (is_hq_admin());

-- 台帳への書き込みはサーバー（service_role）のみ。
-- 上記に INSERT ポリシーを置かないことで、一般ロールからの追記を遮断する。
