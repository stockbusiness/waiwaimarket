-- 0006 仕様漏れテーブルの追加と拡張スキーマの整理
-- 出典：docs/03_data_model.md（本マイグレーションと同時に追記）
--   1. stripe_webhook_events      … Webhook の重複処理防止（docs/04、CLAUDE.md 決済ルール）
--   2. point_reconciliation_logs  … 日次照合の結果と対応履歴（docs/02 6.5）
--   3. product_categories         … 商品カテゴリー（docs/00 5.3「カテゴリー・特集管理」）
--   4. pgcrypto を extensions スキーマへ移動（Supabase の慣例に合わせる）

-- ============================================================
-- 0. pgcrypto を extensions スキーマへ移動
-- ============================================================
-- 0001 は既定（public）スキーマへ作成していた。Supabase の慣例は extensions。
-- gen_random_uuid() は PostgreSQL 13 以降 pg_catalog の組み込み関数のため、
-- 既存の default 式は移動の影響を受けない。
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

do $$
declare
  v_current text;
begin
  select n.nspname into v_current
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_current is null then
    execute 'create extension pgcrypto with schema extensions';
  elsif v_current <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end $$;

-- ============================================================
-- 1. stripe_webhook_events
-- ============================================================
-- docs/04：「Stripe Webhookは署名を検証し、イベントIDで重複処理を防止する」
-- 署名検証はアプリ側。ここでは event_id の一意性で重複処理を拒否する。
create table stripe_webhook_events (
  event_id     text primary key,                       -- Stripe の evt_...
  type         text not null,                          -- payment_intent.succeeded 等
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,                            -- NULL の間は未処理
  process_error text,
  attempts     integer not null default 0 check (attempts >= 0),
  constraint stripe_webhook_events_type_not_blank check (length(btrim(type)) > 0)
);

create index stripe_webhook_events_type_idx on stripe_webhook_events (type, received_at desc);
-- 未処理イベントの再処理用
create index stripe_webhook_events_unprocessed_idx on stripe_webhook_events (received_at)
  where processed_at is null;

comment on table stripe_webhook_events is
  'Stripe Webhook の受信記録。event_id の主キーで同一イベントの二重処理を拒否する。';
comment on column stripe_webhook_events.processed_at is
  '処理完了時刻。NULL の間は未処理として再処理の対象になる。';

alter table stripe_webhook_events enable row level security;

-- 書き込みは service_role のみ（INSERT / UPDATE ポリシーを置かない）。
-- 障害調査のため本部管理者にのみ閲覧を許可する。payload に決済の生データを
-- 含むため、本部オペレーターには開けない。
create policy stripe_webhook_events_hq_admin_read on stripe_webhook_events for select
  using (is_hq_admin());

-- ============================================================
-- 2. point_reconciliation_logs
-- ============================================================
-- docs/02 6.5：「台帳合計と口座残高の一致を日次で照合する」
-- 検知は 0005 の point_balance_reconciliation ビューで行い、
-- 実行結果と対応履歴をこのテーブルへ残す。
create type reconciliation_status as enum ('open','investigating','resolved','ignored');

create table point_reconciliation_logs (
  id                  uuid primary key default gen_random_uuid(),
  executed_on         date not null,                    -- 実行日
  has_difference      boolean not null,                 -- 差分有無
  checked_account_count integer not null default 0 check (checked_account_count >= 0),
  difference_count    integer not null default 0 check (difference_count >= 0),
  difference_detail   jsonb not null default '[]'::jsonb, -- 差分内容
  status              reconciliation_status not null default 'open', -- 対応状況
  resolution_note     text,
  resolved_by         uuid,                             -- 対応者
  resolved_at         timestamptz,                      -- 対応日時
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 日次バッチは冪等。1 実行日につき 1 行に固定する。
  unique (executed_on),
  -- 差分ありのときだけ件数が入る
  constraint point_recon_difference_consistent
    check (has_difference = (difference_count > 0)),
  -- 対応者と対応日時は対で入る
  constraint point_recon_resolution_pairing
    check ((resolved_by is null) = (resolved_at is null)),
  -- 差分ありの回を完了・対象外にするには対応記録が要る。
  -- 差分なしの回はバッチが対応者なしで閉じられる。
  constraint point_recon_closed_requires_resolution
    check (not has_difference
           or status not in ('resolved','ignored')
           or resolved_at is not null)
);

create index point_reconciliation_logs_open_idx on point_reconciliation_logs (executed_on desc)
  where status in ('open','investigating');

comment on table point_reconciliation_logs is
  '日次照合の実行結果と対応履歴。検知は point_balance_reconciliation ビューで行う。';
comment on column point_reconciliation_logs.difference_detail is
  '差分のあった購入者の一覧。[{"buyer_id":..., "ledger":..., "lot":..., "difference":...}] 形式。';

create trigger point_reconciliation_logs_set_updated_at before update on point_reconciliation_logs
  for each row execute function set_updated_at();

alter table point_reconciliation_logs enable row level security;

-- 本部管理者のみ参照・更新可（本部オペレーターは不可：docs/00 5.4）
create policy point_recon_hq_admin_all on point_reconciliation_logs for all
  using (is_hq_admin()) with check (is_hq_admin());

-- ============================================================
-- 3. product_categories
-- ============================================================
-- docs/00 5.3「カテゴリー・特集管理」。0001 の products.category_id は
-- 参照先のないままだったため、テーブルを追加して外部キーを張る。
create table product_categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references product_categories(id) on delete restrict,
  name       text not null,
  slug       text not null unique,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint product_categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint product_categories_no_self_parent check (parent_id is distinct from id)
);

create index product_categories_parent_idx on product_categories (parent_id, sort_order);
create index product_categories_active_idx on product_categories (is_active, sort_order);

comment on table product_categories is
  '商品カテゴリー。parent_id による 2 階層以上の入れ子を許す。階層の深さ制限はアプリ側で行う。';

create trigger product_categories_set_updated_at before update on product_categories
  for each row execute function set_updated_at();

-- 0001 で参照先を持たなかった products.category_id に外部キーを張る。
-- カテゴリー削除で商品を消さないため on delete set null とする。
alter table products
  add constraint products_category_id_fkey
  foreign key (category_id) references product_categories(id) on delete set null;

create index products_category_idx on products (category_id);

alter table product_categories enable row level security;

-- 公開読み取り可（商品一覧・カテゴリー検索はログイン不要：docs/06 4.1）
create policy product_categories_public_read on product_categories for select
  using (is_active = true);

-- 本部は無効なカテゴリーも含めて閲覧、書き込みは本部管理者のみ（docs/00 5.4）
create policy product_categories_hq_read on product_categories for select
  using (is_hq_operator());
create policy product_categories_hq_admin_write on product_categories for all
  using (is_hq_admin()) with check (is_hq_admin());
