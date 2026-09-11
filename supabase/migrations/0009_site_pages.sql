-- 0009 サイト共通の法務・案内ページ
-- 出典：docs/00 5.3（本マイグレーションと同時に追記）
--
-- 特定商取引法に基づく表記（本部分）・会社概要・プライバシーポリシー・
-- 利用規約を本部管理画面から編集できるようにする。
--
-- 0008 の tenant_legal_profiles と役割が違う。あちらは「テナントごとの
-- 事業者情報」で、店舗ページに掲示するもの。こちらは「マーケット全体の
-- 文書」で、本部が管理する。両方が必要（販売者はテナント、決済代行は本部）。
--
-- 本文は必ず版として積み、site_pages は「いまどの版を公開しているか」だけを
-- 持つ。規約やポリシーは改定履歴を残す必要があり、上書き保存にすると
-- 「いつ何を変えたか」を後から示せない。

-- ============================================================
-- 1. ページ
-- ============================================================
create table site_pages (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,           -- /legal/<slug>
  title                 text not null,
  sort_order            integer not null default 0,     -- フッターでの並び
  is_published          boolean not null default false,
  published_revision_id uuid,                           -- 下で外部キーを張る
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint site_pages_title_not_blank check (length(btrim(title)) > 0),
  constraint site_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint site_pages_slug_length check (length(slug) between 2 and 60),
  -- 公開するには公開する版が要る。「公開中なのに本文が無い」状態を作らせない
  constraint site_pages_published_needs_revision
    check (is_published = false or published_revision_id is not null)
);

create index site_pages_published_idx on site_pages (sort_order, slug)
  where is_published = true;

comment on table site_pages is
  'マーケット全体の公開ページ（特商法表記・会社概要・プライバシーポリシー・利用規約など）。本文は site_page_revisions に持つ。';
comment on column site_pages.published_revision_id is
  'いま公開している版。NULL の間は未公開（下書きのみ）。';

create trigger site_pages_set_updated_at before update on site_pages
  for each row execute function set_updated_at();

-- ============================================================
-- 2. 版
-- ============================================================
create table site_page_revisions (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references site_pages(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  body            text not null,                        -- Markdown の限定記法
  note            text,                                 -- 改定内容のメモ（社内用）
  created_by      uuid,                                 -- auth.users.id
  created_at      timestamptz not null default now(),
  constraint site_page_revisions_body_not_blank check (length(btrim(body)) > 0),
  constraint site_page_revisions_unique_number unique (page_id, revision_number)
);

create index site_page_revisions_page_idx
  on site_page_revisions (page_id, revision_number desc);

comment on table site_page_revisions is
  'サイト共通ページの本文の版。追記のみを想定し、公開中の版は削除しない（下の制約で拒否する）。';
comment on column site_page_revisions.body is
  'Markdown の限定記法。アプリ側で解析して React ノードを組み立てるため、HTML は解釈されない。';

-- 循環参照になるため、両方のテーブルを作ってから張る。
-- 公開中の版を消せてしまうと「公開中なのに本文が無い」状態になるので restrict。
-- ページごと消す場合は site_page_revisions.page_id の cascade で先に
-- published_revision_id ごと消えるため、こちらは邪魔をしない。
alter table site_pages
  add constraint site_pages_published_revision_fkey
  foreign key (published_revision_id) references site_page_revisions(id) on delete restrict;

-- 別のページの版を公開中として指せないようにする。
-- 単純な外部キーでは page_id との整合まで見られないため、トリガーで確かめる。
create or replace function site_pages_check_published_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_page_id uuid;
begin
  if new.published_revision_id is null then
    return new;
  end if;

  select page_id into v_page_id
  from site_page_revisions
  where id = new.published_revision_id;

  if v_page_id is distinct from new.id then
    raise exception '公開する版が別のページのものです（page=%, revision=%）', new.id, new.published_revision_id;
  end if;

  return new;
end $$;

comment on function site_pages_check_published_revision() is
  'published_revision_id が自分のページの版であることを確かめる。invoker のままにする（definer にする必要が無い）。';

create trigger site_pages_check_published_revision
  before insert or update of published_revision_id on site_pages
  for each row execute function site_pages_check_published_revision();

-- ============================================================
-- 3. 公開判定の補助関数
-- ============================================================
-- 版の公開可否は site_pages を引かないと決まらない。ポリシーの using 式は
-- 呼び出し元の権限で評価されるため、ポリシー内で site_pages を直接引くと
-- site_pages 側の RLS がかかり、匿名からは常に偽になる（0008 と同じ罠）。
-- security definer に切り出して受けないようにする。
create or replace function is_published_site_revision(revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from site_pages p
    where p.published_revision_id = revision_id
      and p.is_published = true
  );
$$;

comment on function is_published_site_revision(uuid) is
  '指定の版が、公開中のページの公開版であるか。security definer（0008 の legal_public_read と同じ理由）。';

grant execute on function is_published_site_revision(uuid) to anon, authenticated, service_role;

-- ============================================================
-- 4. RLS
-- ============================================================
alter table site_pages enable row level security;
alter table site_page_revisions enable row level security;

-- 公開ページは誰でも読める（ログイン不要）。
create policy site_pages_public_read on site_pages for select
  using (is_published = true and published_revision_id is not null);

-- 本部は下書きも含めて閲覧できる。
create policy site_pages_hq_read on site_pages for select
  using (is_hq_operator());

-- 編集は本部管理者のみ（docs/00 5.4）。
create policy site_pages_hq_admin_write on site_pages for all
  using (is_hq_admin()) with check (is_hq_admin());

-- 版は「公開中の版」だけが外から読める。下書きや過去の版は本部だけ。
create policy site_page_revisions_public_read on site_page_revisions for select
  using (is_published_site_revision(id));

create policy site_page_revisions_hq_read on site_page_revisions for select
  using (is_hq_operator());

create policy site_page_revisions_hq_admin_write on site_page_revisions for all
  using (is_hq_admin()) with check (is_hq_admin());

-- ============================================================
-- 5. 初期データ
-- ============================================================
-- 4 種を下書きとして作る。**公開はしない。**
-- 雛形のまま公開すると、特商法表記や規約として誤った内容を掲示することになる。
-- 本部が内容を入れてから、管理画面で公開に切り替える。
insert into site_pages (slug, title, sort_order) values
  ('terms',     '利用規約',                       10),
  ('privacy',   'プライバシーポリシー',           20),
  ('tokushoho', '特定商取引法に基づく表記',       30),
  ('company',   '会社概要',                       40);

insert into site_page_revisions (page_id, revision_number, body, note)
select p.id, 1, v.body, '初期の雛形（未公開）'
from site_pages p
join (values
  ('terms', '## 第1条（適用）

本規約は、本マーケットの利用に関する条件を定めるものです。

## 第2条（定義）

- 「本部」とは、本マーケットを運営する当社をいいます。
- 「テナント」とは、本部の承認を受けて本マーケットに出品する事業者をいいます。
- 「利用者」とは、本マーケットを利用する方をいいます。

## 第3条（販売者）

商品の販売者は各テナントです。本部は決済および精算を代行します。

## 第4条（改定）

本部は本規約を改定することがあります。改定後の規約は本ページに掲示した時点から適用されます。'),
  ('privacy', '## 1. 取得する情報

本部は、本マーケットの提供にあたり、氏名・連絡先・配送先・決済に関する情報などを取得します。

## 2. 利用目的

- 商品の受注・配送・決済および精算のため
- お問い合わせへの対応のため
- 不正利用の防止のため

## 3. 第三者への提供

決済処理のため決済代行事業者へ、配送のため各テナントおよび配送事業者へ、
必要な範囲で提供します。これら以外の第三者へは、法令に基づく場合を除き提供しません。

## 4. お問い合わせ

本ポリシーに関するお問い合わせ先は「会社概要」に記載しています。'),
  ('tokushoho', '## 販売事業者

各商品の販売者は、商品ページに表示されている各テナントです。
テナントごとの表記は各店舗ページに掲示しています。

## 決済・精算の代行

代金の決済および各テナントへの精算は、本部が代行して行います。

## 運営

- 名称：（記入してください）
- 所在地：（記入してください）
- 代表者：（記入してください）
- 連絡先：（記入してください）

## 支払方法

クレジットカード決済。

## 商品の引渡時期

各商品ページに記載の発送目安によります。

## 返品・交換

各商品ページおよび各店舗の表記によります。'),
  ('company', '## 会社概要

（商号・所在地・代表者・設立・事業内容・連絡先を記入してください）

## お問い合わせ

（問い合わせ先を記入してください）')
) as v(slug, body) on v.slug = p.slug;
