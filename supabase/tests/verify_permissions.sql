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
-- 後片付け
-- ------------------------------------------------------------
reset role;
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
