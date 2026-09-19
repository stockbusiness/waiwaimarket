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
  ('99999999-9999-9999-9999-999999999991', 'hq@example.test'),
  -- 17 章で使う。本部の中でも管理者とオペレーターで線が引かれているため、
  -- オペレーターの側も用意しないと「書けないこと」を測れない
  ('99999999-9999-9999-9999-999999999992', 'hq-operator@example.test');

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
  ('99999999-9999-9999-9999-999999999991', 'hq_admin', '検証本部'),
  ('99999999-9999-9999-9999-999999999992', 'hq_operator', '検証本部オペレーター');

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
-- 8. 公開画面が読む経路（フェーズ2-4）
--
-- 一覧は products を店舗・カテゴリーで絞る。絞り込みの経路からも
-- 未公開のものが漏れないことを確かめる。
-- ------------------------------------------------------------
insert into product_categories (id, name, slug) values
  ('c1111111-0000-4000-8000-00000000000a', '検証カテゴリー', 'verify-category');

update products set category_id = 'c1111111-0000-4000-8000-00000000000a'
 where id in ('f0000000-0000-4000-8000-000000000001',
              'f0000000-0000-4000-8000-000000000002',
              'f0000000-0000-4000-8000-000000000004');

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';

-- カテゴリーで絞っても、公開中の 1 件だけ（審査待ちと未承認テナントは出ない）
select set_config('verify.v',
  (select count(*)::text from products p
   join product_categories c on c.id = p.category_id
   where c.slug = 'verify-category' and c.is_active = true), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名はカテゴリー絞り込みでも公開中の商品しか見えない', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 店舗で絞る経路。未承認テナントの店舗はそもそも引けない
set role anon;
select set_config('verify.v',
  (select count(*)::text from products p
   join stores s on s.tenant_id = p.tenant_id
   where s.slug = 'verify-pending-3'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は未承認テナントの店舗から商品を辿れない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 商品名の部分一致。審査待ちの商品名で検索してもヒットしない
set role anon;
select set_config('verify.v',
  (select count(*)::text from products where title ilike '%検証・審査待ち%'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は商品名検索で審査待ちの商品を見つけられない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 公開中の商品の画像は読める（一覧の代表画像に要る）
insert into product_images (product_id, storage_path, sort_order) values
  ('f0000000-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/f0000000-0000-4000-8000-000000000001/a.png', 0),
  ('f0000000-0000-4000-8000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/f0000000-0000-4000-8000-000000000002/b.png', 0);

set role anon;
select set_config('verify.v',
  (select count(*)::text from product_images
   where product_id = 'f0000000-0000-4000-8000-000000000001'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は公開中の商品の画像を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

set role anon;
select set_config('verify.v',
  (select count(*)::text from product_images
   where product_id = 'f0000000-0000-4000-8000-000000000002'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は審査待ちの商品の画像を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 9. 在庫引当はサーバー処理だけが行う（0011）
--
-- 匿名やテナントから引当関数を呼べると、在庫を押さえ続けて商品を
-- 買えなくできる（在庫枯渇攻撃）。実行権限を service_role に限っている。
-- ------------------------------------------------------------
-- 実行権限そのものを見る。
--
-- 「呼んでみて例外になるか」で測ると、外側の関数の権限を緩めても
-- 内側の関数（release_expired_for_variant）で弾かれて PASS のままになり、
-- 緩めたことを検出できない。付与の状態を直接確かめる。
--
-- Supabase の default privileges が public スキーマの関数に anon と
-- authenticated への EXECUTE を自動で付けるため、0011 で名指しの
-- revoke が要る。それが効いていることの確認でもある。
select set_config('verify.v',
  (select count(*)::text
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) as r(role_name)
   where n.nspname = 'public'
     and p.proname in ('reserve_inventory', 'release_reservation',
                       'release_expired_reservations', 'release_expired_for_variant')
     and has_function_privilege(r.role_name, p.oid, 'execute')), false);
insert into _perm_results (item, expected, actual, verdict)
select '匿名・ログイン利用者に引当関数の実行権限が無い', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  perform release_expired_reservations();
  perform set_config('verify.v', '1', false);
exception when insufficient_privilege then
  perform set_config('verify.v', '0', false);
when others then
  perform set_config('verify.v', '1', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは引当解放バッチを実行できない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 引当そのものの行も外から見えない（0004：ポリシーを置いていない）
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v',
  (select count(*)::text from inventory_reservations), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は引当の明細を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 10. カートは本人だけのもの（0004 carts_self_all / cart_items_self_all）
--
-- 他人のカートが読めると、何を買おうとしているかが漏れる。
-- 書ければ、他人のカートに商品を入れられる。
-- ------------------------------------------------------------
insert into carts (id, buyer_id, tenant_id) values
  ('c0000000-0000-4000-8000-00000000000a', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
insert into cart_items (id, cart_id, variant_id, quantity) values
  ('c1000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a',
   'f1000000-0000-4000-8000-000000000001', 1);

insert into shipping_profiles (id, tenant_id, name, base_fee, free_threshold) values
  ('50000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '検証・標準', 800, 5000);

-- 本人は読める（ポリシーが厳しすぎないことの確認）
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from carts where id = 'c0000000-0000-4000-8000-00000000000a'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は自分のカートを読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 別の利用者からは見えない
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222221';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222221","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from carts where id = 'c0000000-0000-4000-8000-00000000000a'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人のカートを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
select set_config('verify.v',
  (select count(*)::text from cart_items
   where cart_id = 'c0000000-0000-4000-8000-00000000000a'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人のカートの中身を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 他人のカートに商品を入れられない
set role authenticated;
do $$
begin
  insert into cart_items (cart_id, variant_id, quantity)
  values ('c0000000-0000-4000-8000-00000000000a',
          'f1000000-0000-4000-8000-000000000002', 1);
  perform set_config('verify.v', '1', false);
exception when others then
  perform set_config('verify.v', '0', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人のカートに商品を入れられない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 匿名はカートを一切読めない
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v', (select count(*)::text from carts), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名はカートを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 送料は購入前に確認する必要があるので、承認済みテナントの分は公開
set role anon;
select set_config('verify.v',
  (select count(*)::text from shipping_profiles
   where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は承認済みテナントの送料を読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 地域別送料（0012）
-- ------------------------------------------------------------
-- 検査制約の式は書き込みを行うロールの権限で評価される。0011 のつもりで
-- EXECUTE を剥がすと、テナント自身の送料保存が permission denied で落ちる。
-- 「剥がしていないこと」を固定しておく（剥がしたら FAIL に転ずる）。
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '検査関数の EXECUTE を anon から剥がしていない', 'true',
       has_function_privilege('anon', 'is_valid_region_rules(jsonb)', 'execute')::text,
       case when has_function_privilege('anon', 'is_valid_region_rules(jsonb)', 'execute')
            then 'PASS' else 'FAIL' end;

insert into _perm_results (item, expected, actual, verdict)
select '検査関数の EXECUTE を authenticated から剥がしていない', 'true',
       has_function_privilege('authenticated', 'is_valid_region_rules(jsonb)', 'execute')::text,
       case when has_function_privilege('authenticated', 'is_valid_region_rules(jsonb)', 'execute')
            then 'PASS' else 'FAIL' end;

-- 検査制約そのものが付いていること。落とすと形の壊れた jsonb が入り、
-- 送料が静かに基本送料へ落ちる
insert into _perm_results (item, expected, actual, verdict)
select 'region_rules の検査制約がある', '1',
       (select count(*)::text from pg_constraint
         where conname = 'shipping_profiles_region_rules_shape'),
       case when (select count(*) from pg_constraint
                   where conname = 'shipping_profiles_region_rules_shape') = 1
            then 'PASS' else 'FAIL' end;

-- 壊れた形を実際に弾くか。制約が「付いているが素通り」を検出する
do $$
begin
  perform set_config('verify.v', '拒否', false);
  update shipping_profiles
     set region_rules = '{"version":1,"rules":[{"prefectures":["48"],"fee":900}]}'::jsonb
   where id = '50000000-0000-4000-8000-00000000000a';
  perform set_config('verify.v', '通過', false);
exception when check_violation then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '知らない都道府県コードを DB が拒否する', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

do $$
begin
  perform set_config('verify.v', '拒否', false);
  update shipping_profiles
     set region_rules = '{"version":1,"rules":[{"prefectures":["47"],"fee":900},
                                               {"prefectures":["47"],"fee":1}]}'::jsonb
   where id = '50000000-0000-4000-8000-00000000000a';
  perform set_config('verify.v', '通過', false);
exception when check_violation then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '同じ都道府県の重複を DB が拒否する', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 弾きすぎていないことも見る。正しい形が入らなければ設定できない
do $$
begin
  update shipping_profiles
     set region_rules = '{"version":1,"rules":[{"prefectures":["46","47"],"fee":1500}]}'::jsonb
   where id = '50000000-0000-4000-8000-00000000000a';
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '正しい地域別送料は保存できる', '通過', current_setting('verify.v'),
       case when current_setting('verify.v') = '通過' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 配送先住所（0013）
-- ------------------------------------------------------------
reset role;
insert into buyer_addresses (id, buyer_id, recipient_name, phone, postal_code,
                             prefecture_code, city, address_line1, is_default)
values ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
        '検証 太郎', '09011112222', '1500001', '13', '渋谷区', '神宮前 1-1', true),
       ('a0000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000002',
        '検証 花子', '09033334444', '9000001', '47', '那覇市', 'おもろまち 2-2', true);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set request.jwt.claims = '{"role":"authenticated"}';
select set_config('verify.v', (select count(*)::text from buyer_addresses), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は自分の配送先だけ読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- 他人の配送先を書き換えられない。住所は本人以外に触らせない
set role authenticated;
update buyer_addresses set city = '改ざん'
 where id = 'a0000000-0000-4000-8000-00000000000b';
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人の配送先を書き換えられない', '0',
       (select count(*)::text from buyer_addresses where city = '改ざん'),
       case when (select count(*) from buyer_addresses where city = '改ざん') = 0
            then 'PASS' else 'FAIL' end;

-- 他人の buyer_id で登録できない（なりすまし）
--
-- **do ブロックの前に set role を置くこと。** reset role のまま実行すると
-- 所有者（RLS を素通りする）として挿入することになり、ポリシーが正しくても
-- 「通過」と出る。実際にこれで一度 FAIL を出した。
set role authenticated;
do $$
begin
  perform set_config('verify.v', '拒否', false);
  insert into buyer_addresses (buyer_id, recipient_name, phone, postal_code,
                               prefecture_code, city, address_line1)
  values ('00000000-0000-4000-8000-000000000002', 'なりすまし', '09055556666',
          '1500001', '13', '渋谷区', 'x');
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人の buyer_id で配送先を登録できない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 匿名からは 1 件も見えない
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v', (select count(*)::text from buyer_addresses), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は配送先を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 既定の配送先は 1 人 1 件。アプリ側の順序ミスを索引が止める
do $$
begin
  perform set_config('verify.v', '拒否', false);
  insert into buyer_addresses (buyer_id, recipient_name, phone, postal_code,
                               prefecture_code, city, address_line1, is_default)
  values ('00000000-0000-4000-8000-000000000001', '2件目の既定', '09011115555',
          '1000001', '13', '千代田区', '丸の内 1-1', true);
  perform set_config('verify.v', '通過', false);
exception when unique_violation then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '既定の配送先を 2 件持てない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 注文へ写し取る形。0012 と同じく、壊れた形を DB が拒否する
insert into _perm_results (item, expected, actual, verdict)
select 'shipping_address の検査制約がある', '1',
       (select count(*)::text from pg_constraint
         where conname = 'orders_shipping_address_shape'),
       case when (select count(*) from pg_constraint
                   where conname = 'orders_shipping_address_shape') = 1
            then 'PASS' else 'FAIL' end;

insert into _perm_results (item, expected, actual, verdict)
select '郵便番号がハイフン付きの配送先を拒否する', 'false',
       is_valid_shipping_address('{"version":1,"recipientName":"山田","phone":"0312345678",
         "postalCode":"150-0001","prefectureCode":"13","city":"渋谷区",
         "addressLine1":"神宮前"}'::jsonb)::text,
       case when not is_valid_shipping_address('{"version":1,"recipientName":"山田",
         "phone":"0312345678","postalCode":"150-0001","prefectureCode":"13",
         "city":"渋谷区","addressLine1":"神宮前"}'::jsonb)
            then 'PASS' else 'FAIL' end;

insert into _perm_results (item, expected, actual, verdict)
select '正しい形の配送先は通る', 'true',
       is_valid_shipping_address('{"version":1,"recipientName":"山田","phone":"0312345678",
         "postalCode":"1500001","prefectureCode":"13","city":"渋谷区",
         "addressLine1":"神宮前"}'::jsonb)::text,
       case when is_valid_shipping_address('{"version":1,"recipientName":"山田",
         "phone":"0312345678","postalCode":"1500001","prefectureCode":"13",
         "city":"渋谷区","addressLine1":"神宮前"}'::jsonb)
            then 'PASS' else 'FAIL' end;

-- 0012 と同じ理由で剥がさない。剥がすと注文の作成が落ちる
insert into _perm_results (item, expected, actual, verdict)
select '配送先の検査関数の EXECUTE を剥がしていない', 'true',
       has_function_privilege('authenticated', 'is_valid_shipping_address(jsonb)', 'execute')::text,
       case when has_function_privilege('authenticated', 'is_valid_shipping_address(jsonb)', 'execute')
            then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 15. 価格未定の商品と問い合わせ（0014）
--
-- 「問い合わせ商品は売れない」「他人のやり取りは読めない」
-- 「言ったことは書き換えられない」の 3 つを見る。
-- ------------------------------------------------------------
reset role;

-- テナント1 に問い合わせのみの商品を置く（承認済み＝公開されている）
update products set pricing_mode = 'inquiry'
 where id = 'f0000000-0000-4000-8000-000000000001';

-- 既定が fixed であること。既存の商品が勝手に問い合わせ扱いにならない
-- （0014 より前に入っていた商品は pricing_mode を指定せずに作られている）
insert into products (id, tenant_id, title, status) values
  ('f0000000-0000-4000-8000-00000000000d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '検証・販売形態の既定', 'draft');
insert into _perm_results (item, expected, actual, verdict)
select '販売形態の既定は fixed', 'fixed',
       (select pricing_mode::text from products
         where id = 'f0000000-0000-4000-8000-00000000000d'),
       case when (select pricing_mode from products
                   where id = 'f0000000-0000-4000-8000-00000000000d') = 'fixed'
            then 'PASS' else 'FAIL' end;

-- カートに入らない。サーバー処理（所有者）から入れても止まる
do $$
begin
  perform set_config('verify.v', '拒否', false);
  insert into cart_items (cart_id, variant_id, quantity)
  values ('c0000000-0000-4000-8000-00000000000a',
          'f1000000-0000-4000-8000-000000000001', 1);
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '問い合わせ商品はカートに入らない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 0012 と同じで、0011 とは逆。剥がすとカート投入そのものが落ちる
insert into _perm_results (item, expected, actual, verdict)
select '問い合わせ判定の EXECUTE を剥がしていない', 'true',
       has_function_privilege('authenticated', 'is_inquiry_only_variant(uuid)', 'execute')::text,
       case when has_function_privilege('authenticated', 'is_inquiry_only_variant(uuid)', 'execute')
            then 'PASS' else 'FAIL' end;

-- 購入者1 がスレッドを立てる。スレッドと 1 通目は関数で 1 回にまとめる
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('verify.inquiry',
  create_product_inquiry('f0000000-0000-4000-8000-000000000001', '在庫はありますか')::text,
  false);
reset role;

-- 発言者は auth.uid() で決まる。引数に取らないので偽れない
set role authenticated;
do $$
begin
  perform set_config('verify.v', '拒否', false);
  insert into product_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (current_setting('verify.inquiry')::uuid, 'buyer',
          '00000000-0000-4000-8000-000000000002', 'なりすまし');
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '他人の名前で発言できない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 購入者2 からは読めない
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('verify.v', (select count(*)::text from product_inquiry_messages
  where inquiry_id = current_setting('verify.inquiry')::uuid), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '別の購入者は問い合わせのやり取りを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 他テナント（テナント2）からも読めない
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222221';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222221","role":"authenticated"}';
select set_config('verify.v', (select count(*)::text from product_inquiries
  where id = current_setting('verify.inquiry')::uuid), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '別のテナントは問い合わせを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 匿名からは 1 件も見えない
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v', (select count(*)::text from product_inquiries), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は問い合わせを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 追記専用。**所有者（サーバー処理）からも止まることを見る。**
-- 購入者として試すと、RLS に update のポリシーが無いぶん 0 行更新になり、
-- 行が一致しないのでトリガが呼ばれない。「例外が出なかった」を
-- 「通った」と読むと、緩めたことを検出できない
do $$
begin
  perform set_config('verify.v', '拒否', false);
  update product_inquiry_messages set body = '書き換え'
   where inquiry_id = current_setting('verify.inquiry')::uuid;
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '発言は所有者でも書き換えられない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

do $$
begin
  perform set_config('verify.v', '拒否', false);
  delete from product_inquiry_messages
   where inquiry_id = current_setting('verify.inquiry')::uuid;
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
insert into _perm_results (item, expected, actual, verdict)
select '発言は所有者でも消せない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 完了にしたら双方とも書けない
update product_inquiries set status = 'closed'
 where id = current_setting('verify.inquiry')::uuid;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  perform set_config('verify.v', '拒否', false);
  insert into product_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (current_setting('verify.inquiry')::uuid, 'buyer',
          '00000000-0000-4000-8000-000000000001', '完了後の追記');
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '完了した問い合わせには書き込めない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 匿名は関数そのものを呼べない（中の auth.uid() の検査と二重になる）
insert into _perm_results (item, expected, actual, verdict)
select '匿名は問い合わせを立てられない', 'false',
       has_function_privilege('anon', 'create_product_inquiry(uuid,text)', 'execute')::text,
       case when not has_function_privilege('anon', 'create_product_inquiry(uuid,text)', 'execute')
            then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 16. 注文の書き込み（0015）
--
-- 「金額はサーバーのもの」「他店の注文は触れない」「決済前の自分の注文
-- だけ取り消せる」の 3 つを見る。
-- ------------------------------------------------------------
reset role;

insert into orders (id, order_number, buyer_id, tenant_id, subtotal_incl_tax,
                    shipping_fee, total_charged, shipping_address, placed_at)
values ('0dd00000-0000-4000-8000-00000000000a', 'WM-29991231-VERIFY',
        '00000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        1000, 500, 1500,
        '{"version":1,"recipientName":"検証","phone":"0312345678","postalCode":"1500001",
          "prefectureCode":"13","city":"渋谷区","addressLine1":"神宮前 1-2-3"}'::jsonb,
        now());

-- テナントは状態だけ。金額はサーバーが決めたもの
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  perform set_config('verify.v', '拒否', false);
  update orders set total_charged = 1 where id = '0dd00000-0000-4000-8000-00000000000a';
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select 'テナントは注文金額を変えられない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 他店の注文は読めない
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222221';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222221","role":"authenticated"}';
select set_config('verify.v', (select count(*)::text from orders
  where id = '0dd00000-0000-4000-8000-00000000000a'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '別のテナントは注文を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- 他店は発送登録できない。ship_order は invoker なので RLS がそのまま効く
set role authenticated;
select set_config('verify.v',
  ship_order('0dd00000-0000-4000-8000-00000000000a')::text, false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '別のテナントは発送登録できない', 'false', current_setting('verify.v'),
       case when current_setting('verify.v') = 'false' then 'PASS' else 'FAIL' end;

-- 購入者は決済前の自分の注文だけ取り消せる。
-- **`with check` の違反は 0 件更新ではなく例外**になる。
-- 「例外が出ない＝拒否された」と読まないこと
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  perform set_config('verify.v', '拒否', false);
  update orders set status = 'paid' where id = '0dd00000-0000-4000-8000-00000000000a';
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は自分で決済済みにできない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

set role authenticated;
update orders set status = 'cancelled' where id = '0dd00000-0000-4000-8000-00000000000a';
select set_config('verify.v', (select status::text from orders
  where id = '0dd00000-0000-4000-8000-00000000000a'), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は決済前の注文を取り消せる', 'cancelled', current_setting('verify.v'),
       case when current_setting('verify.v') = 'cancelled' then 'PASS' else 'FAIL' end;

-- 匿名からは 1 件も見えない
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v', (select count(*)::text from orders), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は注文を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- サーバー処理だけが呼ぶ関数。0011 の引当関数と同じ扱いで剥がしてある
insert into _perm_results (item, expected, actual, verdict)
select '決済待ちを畳む関数は authenticated から剥がしてある', 'false',
       has_function_privilege('authenticated', 'expire_pending_orders()', 'execute')::text,
       case when not has_function_privilege('authenticated', 'expire_pending_orders()', 'execute')
            then 'PASS' else 'FAIL' end;

-- 逆に、テナント自身が呼ぶ発送登録は剥がさない（0012 の検査関数と同じ事情）
insert into _perm_results (item, expected, actual, verdict)
select '発送登録の EXECUTE を剥がしていない', 'true',
       has_function_privilege('authenticated', 'ship_order(uuid,text,text)', 'execute')::text,
       case when has_function_privilege('authenticated', 'ship_order(uuid,text,text)', 'execute')
            then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 17. ポイントのルールと残高（0016・フェーズ4）
-- ------------------------------------------------------------
-- 本部の中でも線が引かれている。閲覧はオペレーターまで、変更は管理者だけ
-- （docs/00 5.4、0004 の point_rules_hq_read / point_rules_hq_write）。
-- 還元率は「いくら払うか」を決める値なので、読めることと変えられることを
-- 別々に測る。
reset role;
-- いま開いている基本ルールを控える。0016 が入れた id を直接書かない
-- （初期データの id に依存すると、運用で版が積まれた後に動かなくなる）
select set_config('verify.rule',
  (select id::text from point_rules where scope = 'base' and effective_to is null), false);

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v', (select count(*)::text from point_rules), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名はポイントのルールを読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999992';
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999992","role":"authenticated"}';
select set_config('verify.v',
  (select count(*)::text from point_rules where scope = 'base' and effective_to is null), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部オペレーターは基本ルールを読める', '1', current_setting('verify.v'),
       case when current_setting('verify.v') = '1' then 'PASS' else 'FAIL' end;

-- **例外は出ない。** point_rules_hq_write の using が外れるだけなので
-- 0 件更新になる（0014 で一度これを「通った」と読み違えた）。
-- 値が変わっていないことを直接見る。
set role authenticated;
update point_rules set rate = 0.9999
 where id = current_setting('verify.rule')::uuid;
reset role;
select set_config('verify.v',
  (select rate::text from point_rules where id = current_setting('verify.rule')::uuid), false);
insert into _perm_results (item, expected, actual, verdict)
select '本部オペレーターは還元率を変えられない', '0.0100', current_setting('verify.v'),
       case when current_setting('verify.v') = '0.0100' then 'PASS' else 'FAIL' end;

-- こちらは with check に当たるので例外になる（0015 と同じ組み合わせ）
set role authenticated;
do $$
begin
  insert into point_rules (scope, target_id, rate, usage_cap_ratio,
                           confirm_after_days, expire_after_months, effective_from)
  values ('campaign', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 0.0500, 0.500, 14, 12, now());
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部オペレーターはルールを足せない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 本部管理者として。閉じずに 2 本目を足すと 0016 の部分一意索引が拒否する
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999991';
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}';
do $$
begin
  insert into point_rules (id, scope, target_id, rate, usage_cap_ratio,
                           confirm_after_days, expire_after_months, effective_from)
  values ('f1000000-0000-4000-9000-0000000000ff', 'base', null, 0.0200, 0.500, 14, 12, now());
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '前を閉じずに基本ルールを足せない', '拒否', current_setting('verify.v'),
       case when current_setting('verify.v') = '拒否' then 'PASS' else 'FAIL' end;

-- 先に閉じてから足すと通る。順序が要点（0013 の既定配送先と同じ）
set role authenticated;
do $$
begin
  update point_rules set effective_to = now()
   where id = current_setting('verify.rule')::uuid and effective_to is null;
  insert into point_rules (id, scope, target_id, rate, usage_cap_ratio,
                           confirm_after_days, expire_after_months, effective_from)
  values ('f1000000-0000-4000-9000-0000000000ff', 'base', null, 0.0200, 0.500, 14, 12, now());
  perform set_config('verify.v', '通過', false);
exception when others then
  perform set_config('verify.v', '拒否', false);
end $$;
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部管理者は前を閉じてから新しい版を足せる', '通過', current_setting('verify.v'),
       case when current_setting('verify.v') = '通過' then 'PASS' else 'FAIL' end;

insert into _perm_results (item, expected, actual, verdict)
select '版を積んでも開いている基本ルールは 1 本', '1',
       (select count(*)::text from point_rules where scope = 'base' and effective_to is null),
       case when (select count(*) from point_rules
                   where scope = 'base' and effective_to is null) = 1
            then 'PASS' else 'FAIL' end;

-- 残高。口座・ロット・台帳を用意して、他人から見えないことを測る
reset role;
insert into point_accounts (buyer_id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
on conflict (buyer_id) do nothing;

insert into point_lots (id, buyer_id, funding_source_id, status, granted_points,
                        remaining_points, expires_at, point_rule_id)
values ('10770000-0000-4000-9000-00000000000a', '00000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-9000-000000000001', 'available', 300, 300,
        now() + interval '365 days', current_setting('verify.rule')::uuid);

insert into point_ledger_entries (buyer_id, entry_type, delta, lot_id, reason, idempotency_key)
values ('00000000-0000-4000-8000-000000000001', 'earn_confirmed', 300,
        '10770000-0000-4000-9000-00000000000a', '検証用の付与', 'verify-point-1');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('verify.v',
  (select coalesce(sum(available_points), 0)::text from point_balances), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は他人のポイント残高を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('verify.v',
  (select coalesce(sum(available_points), 0)::text from point_balances), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は自分のポイント残高を読める', '300', current_setting('verify.v'),
       case when current_setting('verify.v') = '300' then 'PASS' else 'FAIL' end;

-- 台帳は追記専用（CLAUDE.md 絶対ルール）。本人でも書き換えられない。
-- update のポリシーが無いので 0 件更新になり例外は出ない。中身を直接見る
set role authenticated;
update point_ledger_entries set delta = 99999 where idempotency_key = 'verify-point-1';
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '購入者は台帳の行を書き換えられない', '300',
       (select delta::text from point_ledger_entries where idempotency_key = 'verify-point-1'),
       case when (select delta from point_ledger_entries
                   where idempotency_key = 'verify-point-1') = 300
            then 'PASS' else 'FAIL' end;

-- 本部の発行状況。ビューは security_invoker なので hq_read_lots 越しに見える
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999992';
set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999992","role":"authenticated"}';
select set_config('verify.v',
  (select coalesce(sum(max_discount_reserve), 0)::text from point_outstanding_liability), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '本部オペレーターは未使用ポイントの集計を読める', '300', current_setting('verify.v'),
       case when current_setting('verify.v') = '300' then 'PASS' else 'FAIL' end;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{"role":"anon"}';
select set_config('verify.v',
  (select count(*)::text from point_outstanding_liability), false);
reset role;
insert into _perm_results (item, expected, actual, verdict)
select '匿名は未使用ポイントの集計を読めない', '0', current_setting('verify.v'),
       case when current_setting('verify.v') = '0' then 'PASS' else 'FAIL' end;

-- ------------------------------------------------------------
-- 後片付け
-- ------------------------------------------------------------
reset role;
-- ポイント。台帳は追記専用なので、所有者でもトリガを止めないと消せない
-- （問い合わせの発言と同じ事情。本番では実行しないこと）。
alter table point_ledger_entries disable trigger point_ledger_no_delete;
delete from point_ledger_entries where idempotency_key = 'verify-point-1';
alter table point_ledger_entries enable trigger point_ledger_no_delete;
delete from point_lots where id = '10770000-0000-4000-9000-00000000000a';
delete from point_accounts where buyer_id in ('00000000-0000-4000-8000-000000000001',
                                              '00000000-0000-4000-8000-000000000002');
-- 検証で積んだ版を外し、元の版を開き直す。**この順序でないと**
-- 部分一意索引が「開いている基本ルールが 2 本」を拒否する
delete from point_rules where id = 'f1000000-0000-4000-9000-0000000000ff';
update point_rules set effective_to = null
 where id = current_setting('verify.rule', true)::uuid;
-- **検証用テナントに紐づく注文をまとめて消す。** `orders.tenant_id` は
-- `tenants` への外部キーなので、1 件でも残っていると下の
-- `delete from tenants` が落ちる。そこで後片付けが止まると、次に実行した
-- ときテナントだけが残った状態から始まり、商品も店舗も作れずに
-- 無関係な項目がいくつも FAIL する（実際に踏んだ）。
delete from shipments where order_id in (
  select id from orders where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
                                            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                                            'cccccccc-cccc-cccc-cccc-ccccccccccc1'));
delete from inventory_reservations where order_id in (
  select id from orders where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
                                            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                                            'cccccccc-cccc-cccc-cccc-ccccccccccc1'));
-- order_items は cascade で消える（0001）
delete from orders where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
                                       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                                       'cccccccc-cccc-cccc-cccc-ccccccccccc1');
-- 発言は追記専用なので、所有者でもトリガを止めないと消せない。
-- 検証用の行を残さないための例外で、**本番では実行しないこと**
-- （このスクリプト全体が本番向けではない。冒頭のただし書き参照）。
alter table product_inquiry_messages disable trigger inquiry_messages_no_delete;
delete from product_inquiry_messages
 where inquiry_id = current_setting('verify.inquiry', true)::uuid;
alter table product_inquiry_messages enable trigger inquiry_messages_no_delete;
delete from product_inquiries where id = current_setting('verify.inquiry', true)::uuid;
delete from buyer_addresses where buyer_id in ('00000000-0000-4000-8000-000000000001',
                                               '00000000-0000-4000-8000-000000000002');
delete from carts where id = 'c0000000-0000-4000-8000-00000000000a';
delete from shipping_profiles where id = '50000000-0000-4000-8000-00000000000a';
delete from product_categories where slug = 'verify-category';
delete from products where id in ('f0000000-0000-4000-8000-00000000000d',
                                  'f0000000-0000-4000-8000-000000000001',
                                  'f0000000-0000-4000-8000-000000000002',
                                  'f0000000-0000-4000-8000-000000000003',
                                  'f0000000-0000-4000-8000-000000000004');
update site_pages set is_published = false, published_revision_id = null
 where slug in ('verify-published', 'verify-draft');
delete from site_pages where slug in ('verify-published', 'verify-draft');
delete from audit_logs where action in ('verify.probe', '改ざん');
delete from hq_members where user_id in ('99999999-9999-9999-9999-999999999991',
                                         '99999999-9999-9999-9999-999999999992');
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
