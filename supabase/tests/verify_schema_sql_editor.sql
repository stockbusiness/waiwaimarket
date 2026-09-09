-- スキーマ検証（Supabase SQL Editor 用）
--
-- supabase/tests/verify_schema.sql は psql 用で、\set や \echo などの
-- メタコマンドを含むため SQL Editor では動かない。こちらは単一の SELECT なので
-- そのまま貼り付けて実行できる。
--
-- 判定が FAIL の行があれば、その内容を共有してほしい。
-- なお「テナントが自分の商品を承認できない」ことの実挙動での確認だけは
-- ロール切り替えが要るため psql 版でしか行えない。ここでは
-- ガードのトリガと関数が存在するかを見ている。

with rls_off as (
  select count(*)::int as n,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '') as names
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),
objects as (
  select
    (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind = 'r')::int as tables,
    (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind = 'v')::int as views
),
guard as (
  select
    (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relname = 'products' and t.tgname = 'products_guard_review'
        and not t.tgisinternal)::int as trg,
    (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = 'products_guard_review_columns')::int as fn
),
inv as (
  select coalesce(array_to_string(c.reloptions, ', '), '(未設定)') as opts,
         ('security_invoker=on' = any(coalesce(c.reloptions, '{}'))) as ok
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'v' and c.relname = 'point_balances'
),
buckets as (
  select count(*)::int as n from storage.buckets
  where id in ('product-images', 'tenant-documents')
),
storage_policies as (
  select count(*)::int as n
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'storage' and c.relname = 'objects'
    and p.polname like any (array['product_images_%', 'tenant_documents_%'])
)
select 1 as "#", 'テーブルとビューが揃っている' as "検証項目",
       'テーブル 38・ビュー 4' as "期待",
       'テーブル ' || tables || '・ビュー ' || views as "実際",
       case when tables >= 38 and views >= 4 then 'PASS' else 'FAIL' end as "判定"
from objects
union all
select 2, '全テーブルで RLS が有効', 'RLS 無効テーブル 0 件',
       'RLS 無効テーブル ' || n || ' 件'
         || case when n > 0 then '（' || names || '）' else '' end,
       case when n = 0 then 'PASS' else 'FAIL' end
from rls_off
union all
select 3, '商品の審査ガードが入っている', 'トリガ 1・関数 1',
       'トリガ ' || trg || '・関数 ' || fn,
       case when trg = 1 and fn = 1 then 'PASS' else 'FAIL' end
from guard
union all
select 4, 'point_balances が security_invoker', 'security_invoker=on', opts,
       case when ok then 'PASS' else 'FAIL' end
from inv
union all
select 5, 'Storage バケットが作られた', '2 件', n || ' 件',
       case when n = 2 then 'PASS' else 'FAIL' end
from buckets
union all
select 6, 'Storage ポリシーが作られた', '8 件', n || ' 件',
       case when n = 8 then 'PASS' else 'FAIL' end
from storage_policies
order by 1;
