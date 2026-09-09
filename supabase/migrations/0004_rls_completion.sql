-- 0004 RLS の補完
-- 目的：0002 で RLS 未有効のテーブルを塞ぎ、docs/00 5.1〜5.4 の権限表と
--       docs/05 「権限と情報保護」を満たすポリシーを追加する。
-- 前提：Supabase は public スキーマの新規テーブルへ anon / authenticated に
--       既定で権限を付与する。RLS を有効にしていないテーブルは実質全開放になる。
-- 方針：RLS だけに依存せず API 側でも認可する（CLAUDE.md 全般ルール）。
--       書き込みのうち金額・在庫・ポイントに関わるものはサーバー（service_role）に限定し、
--       ポリシーを置かないことで一般ロールからの直接書き込みを遮断する。

-- ============================================================
-- 0. security definer 関数の search_path を固定
-- ============================================================
-- 0002 の auth_tenant_ids() は security definer だが search_path 未固定のため、
-- 呼び出し側の search_path を差し替えられる余地がある。
alter function auth_tenant_ids() set search_path = public, pg_temp;
alter function is_hq_admin() set search_path = public, pg_temp;
alter function is_hq_operator() set search_path = public, pg_temp;
alter function is_tenant_owner(uuid) set search_path = public, pg_temp;

-- テナント自身が承認済みかどうか（未承認・停止中テナントの出品を止める）
create or replace function is_active_tenant(t uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from tenants
    where id = t and status = 'approved'
  );
$$;

-- サーバー処理（service_role / postgres）かどうか。トリガの例外扱いに使う。
-- anon / authenticated は auth.uid() が NULL でもここでは false になる。
create or replace function is_service_context() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select current_user not in ('anon', 'authenticated');
$$;

-- ============================================================
-- 1. RLS 未有効テーブルの有効化
-- ============================================================
alter table carts                    enable row level security;
alter table cart_items               enable row level security;
alter table inventory_reservations   enable row level security;
alter table shipping_profiles        enable row level security;
alter table refund_items             enable row level security;
alter table marketplace_fee_rules    enable row level security;
alter table point_funding_sources    enable row level security;
alter table point_rules              enable row level security;
alter table point_campaigns          enable row level security;
alter table point_issuance_budgets   enable row level security;

-- inventory_reservations にはポリシーを置かない。
-- 在庫引当は checkout API がサーバー側で行う（docs/06 4.2）。
comment on table inventory_reservations is
  'RLS 有効・ポリシーなし。引当と解放は service_role 経由のサーバー処理のみ。';

-- ============================================================
-- 2. 公開範囲の是正（未承認テナントの露出を止める）
-- ============================================================
-- 0002 の公開ポリシーは商品 status しか見ておらず、停止・未承認テナントの
-- 商品と店舗が公開され続ける。docs/06 フェーズ1完了条件・docs/05
-- 「未承認商品は公開されない」に合わせて置き換える。
drop policy if exists products_public_read on products;
create policy products_public_read on products for select
  using (status = 'approved' and is_active_tenant(tenant_id));

drop policy if exists stores_public_read on stores;
create policy stores_public_read on stores for select
  using (is_public = true and is_active_tenant(tenant_id));

-- ============================================================
-- 3. テナント（自社情報・メンバー・店舗）
-- ============================================================
create policy tenants_member_read on tenants for select
  using (id in (select auth_tenant_ids()));

create policy tenant_members_self_read on tenant_members for select
  using (user_id = auth.uid() or is_tenant_owner(tenant_id));

-- 担当者の追加・削除はテナント管理者（docs/00 5.4）
create policy tenant_members_owner_write on tenant_members for insert
  with check (is_tenant_owner(tenant_id) and role in ('owner','staff'));
create policy tenant_members_owner_update on tenant_members for update
  using (is_tenant_owner(tenant_id))
  with check (is_tenant_owner(tenant_id) and role in ('owner','staff'));
create policy tenant_members_owner_delete on tenant_members for delete
  using (is_tenant_owner(tenant_id));

create policy hq_read_tenant_members on tenant_members for select
  using (is_hq_operator());
create policy hq_read_legal_profiles on tenant_legal_profiles for select
  using (is_hq_operator());

-- 店舗ページの編集はテナント（docs/00 5.2）
create policy stores_tenant_read on stores for select
  using (tenant_id in (select auth_tenant_ids()));
create policy stores_tenant_write on stores for update
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));
create policy hq_read_stores on stores for select using (is_hq_operator());

-- ============================================================
-- 4. 商品・在庫・送料
-- ============================================================
-- 0002 は products にしかテナント書き込みポリシーがなく、SKU と画像を登録できない。
create policy variants_tenant_all on product_variants for all
  using (exists (select 1 from products p
                 where p.id = product_id and p.tenant_id in (select auth_tenant_ids())))
  with check (exists (select 1 from products p
                 where p.id = product_id
                   and p.tenant_id in (select auth_tenant_ids())
                   and is_active_tenant(p.tenant_id)));

create policy images_tenant_all on product_images for all
  using (exists (select 1 from products p
                 where p.id = product_id and p.tenant_id in (select auth_tenant_ids())))
  with check (exists (select 1 from products p
                 where p.id = product_id
                   and p.tenant_id in (select auth_tenant_ids())
                   and is_active_tenant(p.tenant_id)));

create policy hq_read_variants on product_variants for select using (is_hq_operator());
create policy hq_read_images on product_images for select using (is_hq_operator());

-- 在庫は 0002 で RLS 有効かつポリシー皆無のため、公開画面もテナント画面も読めない。
-- 読み取りのみ開き、数量の増減は在庫超過を防ぐためサーバー処理に限定する。
create policy inventories_public_read on inventories for select
  using (exists (select 1 from product_variants v
                 join products p on p.id = v.product_id
                 where v.id = inventories.variant_id
                   and p.status = 'approved'
                   and is_active_tenant(p.tenant_id)));

create policy inventories_tenant_read on inventories for select
  using (exists (select 1 from product_variants v
                 join products p on p.id = v.product_id
                 where v.id = inventories.variant_id
                   and p.tenant_id in (select auth_tenant_ids())));

create policy hq_read_inventories on inventories for select using (is_hq_operator());

comment on table inventories is
  '読み取りのみポリシーで開放する。quantity / reserved_quantity の更新は在庫超過を防ぐため service_role 経由のサーバー処理に限定する。';

-- 送料（購入者は購入前に送料を確認する必要がある）
create policy shipping_profiles_public_read on shipping_profiles for select
  using (is_active_tenant(tenant_id));
create policy shipping_profiles_tenant_write on shipping_profiles for all
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));
create policy hq_read_shipping_profiles on shipping_profiles for select
  using (is_hq_operator());

-- ============================================================
-- 5. カート
-- ============================================================
create policy carts_self_all on carts for all
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid() and is_active_tenant(tenant_id));

create policy cart_items_self_all on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.buyer_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.buyer_id = auth.uid()));

-- ============================================================
-- 6. 配送・返金・領収書
-- ============================================================
-- 購入者が自分の配送状況を確認できない状態だった（docs/00 5.1）。
create policy shipments_buyer_read on shipments for select
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy hq_read_shipments on shipments for select using (is_hq_operator());

-- テナントは自店舗の返品・返金対応を行う（docs/00 5.2）。
create policy refunds_tenant_read on refunds for select
  using (exists (select 1 from orders o
                 where o.id = order_id and o.tenant_id in (select auth_tenant_ids())));
create policy refunds_buyer_read on refunds for select
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid()));

create policy refund_items_tenant_read on refund_items for select
  using (exists (select 1 from refunds r join orders o on o.id = r.order_id
                 where r.id = refund_id and o.tenant_id in (select auth_tenant_ids())));
create policy refund_items_buyer_read on refund_items for select
  using (exists (select 1 from refunds r join orders o on o.id = r.order_id
                 where r.id = refund_id and o.buyer_id = auth.uid()));
create policy hq_read_refund_items on refund_items for select using (is_hq_operator());

create policy receipts_tenant_read on receipts for select
  using (issuer_tenant_id in (select auth_tenant_ids()));
create policy hq_read_receipts on receipts for select using (is_hq_operator());

-- ============================================================
-- 7. 精算
-- ============================================================
-- 0002 は settlement_items に RLS を有効化したままポリシーがなく、
-- テナントが精算明細（売上・手数料・ポイント負担）を確認できない（docs/00 5.2）。
create policy settlement_items_owner_read on settlement_items for select
  using (exists (select 1 from settlements s
                 where s.id = settlement_id and is_tenant_owner(s.tenant_id)));
create policy hq_read_settlement_items on settlement_items for select
  using (is_hq_operator());
create policy hq_read_settlements on settlements for select using (is_hq_operator());

-- 手数料率の設定は本部管理者のみ（docs/00 5.3、5.4）
create policy marketplace_fee_rules_hq_read on marketplace_fee_rules for select
  using (is_hq_operator());
create policy marketplace_fee_rules_hq_write on marketplace_fee_rules for all
  using (is_hq_admin()) with check (is_hq_admin());
create policy marketplace_fee_rules_tenant_read on marketplace_fee_rules for select
  using (tenant_id in (select auth_tenant_ids()));

-- ============================================================
-- 8. ポイント（ルール・予算・負担元）
-- ============================================================
-- ルール変更・精算確定・手動調整は本部管理者のみ、閲覧はオペレーターまで。
create policy point_rules_hq_read on point_rules for select using (is_hq_operator());
create policy point_rules_hq_write on point_rules for all
  using (is_hq_admin()) with check (is_hq_admin());

create policy point_campaigns_hq_read on point_campaigns for select using (is_hq_operator());
create policy point_campaigns_hq_write on point_campaigns for all
  using (is_hq_admin()) with check (is_hq_admin());

create policy point_funding_sources_hq_read on point_funding_sources for select
  using (is_hq_operator());
create policy point_funding_sources_hq_write on point_funding_sources for all
  using (is_hq_admin()) with check (is_hq_admin());

create policy point_issuance_budgets_hq_read on point_issuance_budgets for select
  using (is_hq_operator());
create policy point_issuance_budgets_hq_write on point_issuance_budgets for all
  using (is_hq_admin()) with check (is_hq_admin());

-- ============================================================
-- 9. ポイント（口座・利用配分）
-- ============================================================
-- 本部は未使用残高・最大値引き原資を把握する必要がある（docs/00 5.3、成功条件7）。
create policy hq_read_point_accounts on point_accounts for select using (is_hq_operator());
create policy hq_read_point_reservations on point_reservations for select using (is_hq_operator());

-- 0002 は point_usage_allocations に RLS を有効化したままポリシーがなく、
-- 本部も購入者も参照できなかった（docs/05「元ロット・明細別使用数を再現できる」）。
create policy point_usage_alloc_self_read on point_usage_allocations for select
  using (exists (select 1 from point_reservations r
                 where r.id = reservation_id and r.buyer_id = auth.uid()));
create policy point_usage_alloc_hq_read on point_usage_allocations for select
  using (is_hq_operator());

-- 手動調整の申請は本部オペレーターも閲覧できるようにする（承認は管理者のみ）。
create policy point_adjustment_hq_read on point_adjustment_requests for select
  using (is_hq_operator());

-- ============================================================
-- 10. 商品審査の権限分離（docs/00 5.3、docs/05「未承認商品は公開されない」）
-- ============================================================
-- 0002 の products_tenant_all は with check が tenant_id しか見ておらず、
-- テナントが自分で status='approved' に変更できてしまう。
-- 未承認テナントの出品も止まらない。ポリシーを置き換え、審査列はトリガで守る。
drop policy if exists products_tenant_all on products;

create policy products_tenant_read on products for select
  using (tenant_id in (select auth_tenant_ids()));
create policy products_tenant_write on products for insert
  with check (tenant_id in (select auth_tenant_ids()) and is_active_tenant(tenant_id));
create policy products_tenant_update on products for update
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()) and is_active_tenant(tenant_id));
create policy products_tenant_delete on products for delete
  using (tenant_id in (select auth_tenant_ids()) and status = 'draft');

create policy hq_write_products on products for all
  using (is_hq_operator()) with check (is_hq_operator());

-- security definer にしない。definer にすると関数内の current_user が所有者に
-- 変わり、is_service_context() が常に真になってガードが素通りする。
create or replace function products_guard_review_columns() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- 本部オペレーター以上、またはサーバー処理（service_role）は審査列を操作できる。
  if is_hq_operator() or is_service_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft','submitted') then
      raise exception '商品の初期状態は draft または submitted のみです';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    raise exception '商品の承認・差戻しは本部のみが行えます';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception '審査記録は変更できません';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception '商品の所属テナントは変更できません';
  end if;
  return new;
end $$;

create trigger products_guard_review before insert or update on products
  for each row execute function products_guard_review_columns();
