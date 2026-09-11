-- 0010 商品管理（フェーズ2-1）に必要な列・制約・ポリシー
-- 出典：docs/00 5.2・5.3、docs/06 フェーズ2-1、docs/05「未承認商品は公開されない」
--
-- 0001〜0008 でテーブル・RLS・審査ガードは揃っているが、画面を作るのに
-- 足りないものが 3 つある。
--   1. 差戻し理由の置き場所が無い（テナントが理由を見られず直せない）
--   2. inventories に書き込みポリシーが無い（在庫数を登録できない）
--   3. 表題や SKU が空文字でも通る

-- ============================================================
-- 1. 差戻し理由
-- ============================================================
-- 本部が書き、テナントは読むだけ。監査ログの detail にも残すが、
-- テナントは監査ログを読めない（0002 hq_read_audit）ため、
-- 商品の行に持たせないと差戻しの理由が伝わらない。
alter table products add column review_note text;

comment on column products.review_note is
  '審査の所見。差戻しの理由をテナントへ伝えるために使う。本部のみが書ける（products_guard_review_columns）。';

-- 0004 のガードを差戻し理由まで守るよう置き換える。
-- security definer にしないこと。definer にすると関数内の current_user が
-- 所有者に変わり、is_service_context() が常に真になってガードが素通りする。
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
    new.review_note := null;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    raise exception '商品の承認・差戻しは本部のみが行えます';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception '審査記録は変更できません';
  end if;
  if new.review_note is distinct from old.review_note then
    raise exception '審査の所見は変更できません';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception '商品の所属テナントは変更できません';
  end if;
  return new;
end $$;

-- ============================================================
-- 2. 在庫数の書き込み
-- ============================================================
-- 0004 は inventories に読み取りポリシーしか置いていない。
-- SKU を登録しても在庫数を入れられないため、テナントの書き込みを許す。
-- 担当者も可（在庫は「自店舗の商品・受注・発送」の範囲：docs/00 5.4）。
--
-- 判定で products を引くが、ここは 0004 の inventories_tenant_read と同じ形。
-- テナント利用者からは products_tenant_read が自社の商品を見せるので成立する。
-- 削除ポリシーは置かない。SKU を消せば on delete cascade で在庫行も消える。
create policy inventories_tenant_insert on inventories for insert
  with check (exists (select 1 from product_variants v
                      join products p on p.id = v.product_id
                      where v.id = inventories.variant_id
                        and p.tenant_id in (select auth_tenant_ids())
                        and is_active_tenant(p.tenant_id)));

create policy inventories_tenant_update on inventories for update
  using (exists (select 1 from product_variants v
                 join products p on p.id = v.product_id
                 where v.id = inventories.variant_id
                   and p.tenant_id in (select auth_tenant_ids())))
  with check (exists (select 1 from product_variants v
                      join products p on p.id = v.product_id
                      where v.id = inventories.variant_id
                        and p.tenant_id in (select auth_tenant_ids())
                        and is_active_tenant(p.tenant_id)));

-- 引当数はサーバー処理（フェーズ2-3 の引当・解放）だけが動かす。
-- テナントが reserved_quantity を下げると、引当中の在庫を二重に売れてしまう。
create or replace function inventories_guard_reserved() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if is_service_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.reserved_quantity := 0;
    return new;
  end if;
  if new.reserved_quantity is distinct from old.reserved_quantity then
    raise exception '引当数は変更できません';
  end if;
  return new;
end $$;

comment on function inventories_guard_reserved() is
  '引当数をサーバー処理だけに限る。invoker のままにすること（definer にすると current_user が所有者に変わり is_service_context() が常に真になる）。';

create trigger inventories_guard_reserved before insert or update on inventories
  for each row execute function inventories_guard_reserved();

-- ============================================================
-- 3. 空文字・形式の制約
-- ============================================================
-- 0003 は products / product_variants / product_images に制約を置いていない。
-- 表題が空の商品や SKU が空白だけの行が作れてしまう。
alter table products
  add constraint products_title_not_blank check (length(btrim(title)) > 0);

alter table product_variants
  add constraint product_variants_sku_format
    check (sku ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$' and length(sku) between 1 and 64);

alter table product_images
  add constraint product_images_path_not_blank
    check (length(btrim(storage_path)) > 0);

-- 画像の並びは 1 商品の中で一意にする。同じ順序の行が並ぶと表示順が不定になる。
create unique index product_images_order_idx on product_images (product_id, sort_order);

-- ============================================================
-- 4. 検索用の索引
-- ============================================================
-- 本部の審査待ち一覧（status 順・古い順）と、カテゴリー別の公開一覧。
create index products_status_idx on products (status, updated_at desc);
