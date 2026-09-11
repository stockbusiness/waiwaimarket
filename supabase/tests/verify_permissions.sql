-- ============================================================
-- 権限と情報保護の検証（docs/05 12章）
--
-- verify_schema.sql が見ているのは「RLS が有効か」「ビューが
-- security_invoker か」という設定の確認であり、実際に誰が何を読めるかは
-- 確かめていない。このスクリプトはロールを切り替えて実挙動を測る。
--
-- psql でも Supabase の SQL Editor でも動くよう、psql のメタコマンド
-- （\set、\echo）は使わない。最後の SELECT が判定表になる。
--
-- 検証用の行は最後に削除するため、実データには残らない。
-- ただし本番では実行しないこと。
-- ============================================================

create temp table if not exists _perm_results (
  seq serial,
  item text,
  expected text,
  actual text,
  verdict text
) on commit preserve rows;

truncate _perm_results;

-- ------------------------------------------------------------
-- 検証用データ
--
-- テナント1（承認済み）: owner1 と staff1 が所属
-- テナント2（承認済み）: owner2 が所属
-- テナント3（申請中）  : owner3 が所属。未承認の扱いを見る
-- ------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner1@example.test'),
  ('11111111-1111-1111-1111-111111111112', 'staff1@example.test'),
  ('22222222-2222-2222-2222-222222222221', 'owner2@example.test'),
  ('33333333-3333-3333-3333-333333333331', 'owner3@example.test'),
  ('99999999-9999-9999-9999-999999999991', 'hq@example.test');

insert into tenants (id, name, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '検証テナント1', 'approved'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '検証テナント2', 'approved'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '検証テナント3', 'applied');

insert into tenant_members (tenant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111112', 'staff'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222221', 'owner'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '33333333-3333-3333-3333-333333333331', 'owner');

insert into tenant_legal_profiles
  (tenant_id, legal_name, representative_name, address, phone, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '検証商会1', '代表1', '東京都', '03-0000-0001', 'l1@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '検証商会2', '代表2', '東京都', '03-0000-0002', 'l2@example.test'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '検証商会3', '代表3', '東京都', '03-0000-0003', 'l3@example.test');

insert into stores (tenant_id, slug, display_name, is_public) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'verify-open-1', '公開店舗1', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'verify-hidden-2', '非公開店舗2', false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'verify-pending-3', '未承認店舗3', true);

insert into hq_members (user_id, role, display_name) values
  ('99999999-9999-9999-9999-999999999991', 'hq_admin', '検証本部');

insert into audit_logs (actor_id, actor_role, action, target_table, target_id) values
  ('99999999-9999-9999-9999-999999999991', 'hq_admin', 'verify.probe', 'tenants',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

-- ------------------------------------------------------------
-- 1. テナント管理者は他テナントの情報を読めない（docs/05 12章）
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select set_config('verify.v',
  (select count(*)::text from tenants where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナント管理者は他テナントの tenants 行を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
select set_config('verify.v',
  (select count(*)::text from tenant_members
   where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナント管理者は他テナントの担当者一覧を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 自テナントは読める（ポリシーが厳しすぎないことの確認）
set role authenticated;
select set_config('verify.v',
  (select count(*)::text from tenants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナント管理者は自テナントの tenants 行を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 2. テナント担当者（staff）は事業者情報を編集できない（docs/00 5.4）
--
-- legal_owner_all は is_tenant_owner() を要求するので、担当者は書き込めない。
-- 読み取りは legal_public_read（承認済みテナントなら公開）で通る点に注意。
-- 承認前は読めないことを 3 で確認する。
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111112';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111112","role":"authenticated"}';

do $$
begin
  update tenant_legal_profiles set legal_name = '書き換え'
   where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  perform set_config('verify.v', (select count(*)::text from tenant_legal_profiles
    where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' and legal_name = '書き換え'), false);
exception when insufficient_privilege then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナント担当者は事業者情報を書き換えられない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 3. 未承認テナントの情報は外部に出ない
--
-- 匿名から見えると、どのテナントが審査中かが分かってしまう。
-- ------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';

select set_config('verify.v',
  (select count(*)::text from tenant_legal_profiles
   where tenant_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は未承認テナントの事業者情報を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from stores where slug = 'verify-pending-3'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は未承認テナントの店舗を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from stores where slug = 'verify-hidden-2'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は非公開の店舗を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from stores where slug = 'verify-open-1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は公開かつ承認済みの店舗を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 承認済みテナントの特商法表記は匿名から読める（法定の公開事項）
set role anon;
select set_config('verify.v',
  (select count(*)::text from tenant_legal_profiles
   where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は承認済みテナントの特商法表記を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v', (select count(*)::text from tenants), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は tenants を 1 行も読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 4. 監査ログは本部だけが読める（docs/05 12章）
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from audit_logs where action = 'verify.probe'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは監査ログを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999991';
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from audit_logs where action = 'verify.probe'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部は監査ログを読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 監査ログは誰も書き換えられない（追記のみ）
set role authenticated;
do $$
begin
  update audit_logs set action = '改ざん' where action = 'verify.probe';
  perform set_config('verify.v',
    (select count(*)::text from audit_logs where action = '改ざん'), false);
exception when insufficient_privilege then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部でも監査ログを書き換えられない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 5. 本部は全テナントを読める（審査に必要）
-- ------------------------------------------------------------
set role authenticated;
select set_config('verify.v',
  (select count(*)::text from tenants
   where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
                'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                'cccccccc-cccc-cccc-cccc-ccccccccccc1')), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部は全テナントを読める', '3', current_setting('verify.v'),
       case when current_setting('verify.v') = '3' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 6. サイト共通ページは公開中のものだけが外に出る（0009）
--
-- 下書きの規約が公開ページとして読めてしまうと、確定前の文面が
-- 外に出る。版（本文）も同じで、公開中の版だけが読める。
-- ------------------------------------------------------------
insert into site_pages (id, slug, title, sort_order) values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'verify-published', '検証・公開ページ', 900),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'verify-draft', '検証・下書きページ', 901);

insert into site_page_revisions (id, page_id, revision_number, body) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', 1, '公開中の本文'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', 2, '公開していない新しい版'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
   'dddddddd-dddd-dddd-dddd-ddddddddddd2', 1, '下書きの本文');

update site_pages
   set published_revision_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
       is_published = true
 where id = 'dddddddd-dddd-dddd-dddd-ddddddddddd1';

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';

select set_config('verify.v',
  (select count(*)::text from site_pages where slug = 'verify-published'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は公開中のサイトページを読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from site_pages where slug = 'verify-draft'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は下書きのサイトページを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from site_page_revisions
   where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は公開中の版の本文を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 公開ページであっても、公開していない版は外に出さない
set role anon;
select set_config('verify.v',
  (select count(*)::text from site_page_revisions
   where id in ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
                'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3')), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は公開していない版の本文を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナント利用者も本部ではないので下書きは見えない
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from site_pages where slug = 'verify-draft'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナント利用者は下書きのサイトページを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 書き換えは本部管理者だけ。匿名が書き換えられたら公開文書が改ざんできる
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
do $$
begin
  update site_pages set title = '改ざん' where slug = 'verify-published';
  perform set_config('verify.v',
    (select count(*)::text from site_pages where title = '改ざん'), false);
exception when insufficient_privilege then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名はサイトページを書き換えられない', '0',
       (select count(*)::text from site_pages where title = '改ざん'),
       case when (select count(*) from site_pages where title = '改ざん') = 0
            then 'PASS' else 'FAIL' end;

-- 本部は下書きも読める（編集に必要）
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999991';
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from site_pages
   where slug in ('verify-published', 'verify-draft')), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部は下書きを含めてサイトページを読める', '2', current_setting('verify.v'),
       case when current_setting('verify.v') = '2' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 7. 商品は承認されたものだけが外に出る（0002・0004・0010）
--
-- テナント1 に、公開中・審査待ち・差し戻しの 3 つを用意する。
-- テナント3（未承認）にも公開中の商品を置き、テナントの状態でも
-- 止まることを確かめる。
-- ------------------------------------------------------------
insert into products (id, tenant_id, title, status) values
  ('f0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '検証・公開中', 'approved'),
  ('f0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '検証・審査待ち', 'submitted'),
  -- 他テナントの「未公開」商品。承認済みの商品は公開情報なので、
  -- テナント利用者から見えて当然（products_public_read が誰にでも許す）。
  -- 隠れていなければならないのは審査前の商品のほう。
  ('f0000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '検証・他テナント未公開', 'submitted'),
  ('f0000000-0000-4000-8000-000000000004', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', '検証・未承認テナント', 'approved');

insert into product_variants (id, product_id, sku, price_incl_tax) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'VERIFY-1', 1000),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'VERIFY-2', 2000);

insert into inventories (variant_id, quantity) values
  ('f1000000-0000-4000-8000-000000000001', 5),
  ('f1000000-0000-4000-8000-000000000002', 5);

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';

select set_config('verify.v',
  (select count(*)::text from products where id = 'f0000000-0000-4000-8000-000000000001'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は承認済みテナントの公開中商品を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from products where id = 'f0000000-0000-4000-8000-000000000002'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は審査待ちの商品を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 商品が approved でも、テナントが未承認なら公開しない（0004 の是正点）
set role anon;
select set_config('verify.v',
  (select count(*)::text from products where id = 'f0000000-0000-4000-8000-000000000004'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は未承認テナントの商品を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 価格と在庫も、商品が公開されていなければ出さない
set role anon;
select set_config('verify.v',
  (select count(*)::text from product_variants
   where id = 'f1000000-0000-4000-8000-000000000002'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は審査待ち商品の SKU を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from inventories
   where variant_id = 'f1000000-0000-4000-8000-000000000002'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は審査待ち商品の在庫を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナントは他店の商品を読めない
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from products where id = 'f0000000-0000-4000-8000-000000000003'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは他店の未公開商品を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナントは自分で承認できない（0010 のトリガ）
set role authenticated;
do $$
begin
  update products set status = 'approved'
   where id = 'f0000000-0000-4000-8000-000000000002';
  perform set_config('verify.v', (select count(*)::text from products
    where id = 'f0000000-0000-4000-8000-000000000002' and status = 'approved'), false);
exception when others then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは自分の商品を承認できない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナントは審査の所見を書き換えられない（0010）
reset role;
update products set review_note = '本部が書いた所見'
 where id = 'f0000000-0000-4000-8000-000000000002';

set role authenticated;
do $$
begin
  update products set review_note = '書き換え'
   where id = 'f0000000-0000-4000-8000-000000000002';
  perform set_config('verify.v', (select count(*)::text from products
    where id = 'f0000000-0000-4000-8000-000000000002' and review_note = '書き換え'), false);
exception when others then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは審査の所見を書き換えられない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナントは引当数を動かせない（0010）。動かせると引当中の在庫を二重に売れる
set role authenticated;
do $$
begin
  update inventories set reserved_quantity = 3
   where variant_id = 'f1000000-0000-4000-8000-000000000001';
  perform set_config('verify.v', (select count(*)::text from inventories
    where variant_id = 'f1000000-0000-4000-8000-000000000001' and reserved_quantity = 3), false);
exception when others then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは引当数を変更できない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- テナントは自店の在庫数を更新できる（ポリシーが厳しすぎないことの確認）
set role authenticated;
do $$
begin
  update inventories set quantity = 42
   where variant_id = 'f1000000-0000-4000-8000-000000000001';
  perform set_config('verify.v', (select count(*)::text from inventories
    where variant_id = 'f1000000-0000-4000-8000-000000000001' and quantity = 42), false);
exception when others then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは自店の在庫数を更新できる', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 後片付け
-- ------------------------------------------------------------
reset role;
delete from products where id in ('f0000000-0000-4000-8000-000000000001',
                                  'f0000000-0000-4000-8000-000000000002',
                                  'f0000000-0000-4000-8000-000000000003',
                                  'f0000000-0000-4000-8000-000000000004');
update site_pages set is_published = false, published_revision_id = null
 where slug in ('verify-published', 'verify-draft');
delete from site_pages where slug in ('verify-published', 'verify-draft');
delete from audit_logs where action in ('verify.probe', '改ざん');
delete from hq_members where user_id = '99999999-9999-9999-9999-999999999991';
delete from tenants where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
                                 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                                 'cccccccc-cccc-cccc-cccc-ccccccccccc1');
delete from auth.users where email like '%@example.test';

-- ------------------------------------------------------------
-- 判定表
-- ------------------------------------------------------------
select
  seq as "#",
  item as "検証項目",
  expected as "期待",
  actual as "実測",
  verdict as "判定"
from _perm_results
order by seq;
