-- 0007 本部ユーザーの管理
-- 出典：docs/00 5.3・5.4（本部管理者／本部オペレーターの権限表）
--       docs/03_data_model.md（本マイグレーションと同時に追記）
--
-- 0002 の is_hq_admin() / is_hq_operator() は JWT の app_metadata.role だけを
-- 見ていた。これでは本部ユーザーの一覧・棚卸し・権限変更の履歴を画面から
-- 扱えないため、hq_members を唯一の正とし、両関数の中身を差し替える。
-- 関数名とシグネチャは変えないので、0002〜0006 のポリシーはそのまま動く。

create type hq_role as enum ('hq_admin','hq_operator');

create table hq_members (
  user_id      uuid primary key,          -- auth.users.id
  role         hq_role not null,
  display_name text not null,
  is_active    boolean not null default true,
  invited_by   uuid,                       -- 付与した本部管理者
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hq_members_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create index hq_members_active_role_idx on hq_members (role) where is_active;

comment on table hq_members is
  '本部運営者。ロールの唯一の正とし、is_hq_admin() / is_hq_operator() はここを参照する。';
comment on column hq_members.is_active is
  '退任時は行を消さずに false にする。監査ログから参照できる状態を保つため。';

create trigger hq_members_set_updated_at before update on hq_members
  for each row execute function set_updated_at();

-- ============================================================
-- ロール判定関数の差し替え
-- ============================================================
-- hq_members は RLS を有効にするため、判定関数は security definer にする。
-- ポリシー側から呼ばれても再帰しないのはこのため。
create or replace function current_hq_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.role::text
  from hq_members m
  where m.user_id = auth.uid() and m.is_active;
$$;

comment on function current_hq_role() is
  'ログイン中の利用者の本部ロール。本部でなければ NULL。アプリからは rpc で呼ぶ。';

create or replace function is_hq_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(current_hq_role() = 'hq_admin', false);
$$;

create or replace function is_hq_operator() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(current_hq_role() in ('hq_admin','hq_operator'), false);
$$;

grant execute on function current_hq_role() to anon, authenticated, service_role;

-- ============================================================
-- RLS
-- ============================================================
alter table hq_members enable row level security;

-- 本人は自分の行だけ見える（画面に自分のロールを出すため）
create policy hq_members_self_read on hq_members for select
  using (user_id = auth.uid());

-- 本部オペレーターは一覧を閲覧できる
create policy hq_members_operator_read on hq_members for select
  using (is_hq_operator());

-- 付与・変更・停止は本部管理者のみ（docs/00 5.4）
create policy hq_members_admin_write on hq_members for all
  using (is_hq_admin()) with check (is_hq_admin());

-- ============================================================
-- 初期登録について
-- ============================================================
-- hq_members が空の間は is_hq_admin() が誰に対しても false になるため、
-- 最初の 1 人だけは service_role（または psql）で登録する必要がある。
--
--   insert into hq_members (user_id, role, display_name)
--   values ('<auth.users.id>', 'hq_admin', '本部管理者');
--
-- 2 人目以降は本部管理者が管理画面から追加できる。
-- 本番では多要素認証の設定を併せて必須とする（docs/00 8.2）。
