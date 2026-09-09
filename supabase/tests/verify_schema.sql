-- スキーマ検証スクリプト
-- 使い方: psql -d <db> -f supabase/tests/verify_schema.sql
-- 副作用: 検証用の行を作り、最後に必ず削除する。既存データは変更しない。
--
-- 1. public スキーマの全テーブルで RLS が有効か
-- 2. テナントロールで products を approved に UPDATE すると失敗するか
-- 3. point_balances が security_invoker になっているか

\set ON_ERROR_STOP on
\pset border 2

drop table if exists verify_results;
create temporary table verify_results (
  seq int, item text, expected text, actual text, result text
);

-- ============================================================
-- 1. RLS の有効状況
-- ============================================================
\echo ''
\echo '=============================================================='
\echo ' 1. public スキーマの各テーブルの RLS 有効状況'
\echo '=============================================================='
select c.relname                                   as "テーブル",
       case when c.relrowsecurity then 'ON' else 'OFF' end as "RLS",
       (select count(*) from pg_policy p where p.polrelid = c.oid) as "ポリシー数",
       case when c.relrowsecurity then 'OK' else '★NG' end        as "判定"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

insert into verify_results
select 1,
       '全テーブルで RLS が有効',
       'RLS 無効テーブル 0 件',
       'RLS 無効テーブル ' || count(*) || ' 件'
         || case when count(*) > 0
                 then '（' || string_agg(c.relname, ', ' order by c.relname) || '）'
                 else '' end,
       case when count(*) = 0 then 'PASS' else 'FAIL' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- ============================================================
-- 2. テナントロールによる商品の自己承認
-- ============================================================
do $$
declare
  v_tenant  uuid := '0e000000-0000-4000-8000-000000000001';
  v_user    uuid := '0e000000-0000-4000-8000-000000000002';
  v_product uuid := '0e000000-0000-4000-8000-000000000003';
  v_status  text;
  v_rows    int;
  v_actual  text;
  v_result  text;
begin
  insert into tenants (id, name, status) values (v_tenant, '検証用テナント', 'approved');
  insert into tenant_members (tenant_id, user_id, role) values (v_tenant, v_user, 'owner');
  insert into products (id, tenant_id, title, status)
    values (v_product, v_tenant, '検証用商品', 'draft');

  begin
    -- テナント管理者としてふるまう
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_user::text, true);

    update products set status = 'approved' where id = v_product;
    get diagnostics v_rows = row_count;

    reset role;
    select status::text into v_status from products where id = v_product;

    if v_status = 'approved' then
      v_actual := 'UPDATE ' || v_rows || ' 行が通り、status が approved になった';
      v_result := 'FAIL';
    else
      v_actual := 'UPDATE ' || v_rows || ' 行（RLS が対象行を除外。status は ' || v_status || ' のまま）';
      v_result := 'PASS';
    end if;
  exception when others then
    reset role;
    v_actual := '例外で拒否: ' || sqlerrm;
    v_result := 'PASS';
  end;

  insert into verify_results values
    (2, 'テナントロールが products を approved に UPDATE',
     '拒否される（例外 または 0 行）', v_actual, v_result);

  -- 後片付け
  delete from products where id = v_product;
  delete from tenant_members where tenant_id = v_tenant;
  delete from tenants where id = v_tenant;
end $$;

-- ============================================================
-- 3. point_balances の security_invoker
-- ============================================================
\echo ''
\echo '=============================================================='
\echo ' 3. public スキーマのビューの security_invoker 設定'
\echo '=============================================================='
select c.relname as "ビュー",
       coalesce(array_to_string(c.reloptions, ', '), '(未設定)') as "reloptions",
       case when 'security_invoker=on' = any(coalesce(c.reloptions, '{}'))
            then 'OK' else '★NG' end as "判定"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname;

insert into verify_results
select 3,
       'point_balances が security_invoker',
       'security_invoker=on',
       coalesce(array_to_string(c.reloptions, ', '), '(未設定)'),
       case when 'security_invoker=on' = any(coalesce(c.reloptions, '{}'))
            then 'PASS' else 'FAIL' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' and c.relname = 'point_balances';

-- ============================================================
-- 結果
-- ============================================================
\echo ''
\echo '=============================================================='
\echo ' 検証結果'
\echo '=============================================================='
select seq as "#", item as "検証項目", expected as "期待", actual as "実際", result as "判定"
from verify_results order by seq;
