-- 0012 地域別送料の構造（フェーズ3）
-- 出典：docs/03 7.1 shipping_profiles、docs/01（送料の消費税率）
--
-- 0001 で `region_rules jsonb not null default '{}'` だけ置いてあり、構造が
-- 決まっていなかったため使っていなかった。2026-09-12 に次の形で確定した。
--
--   { "version": 1,
--     "rules": [ { "prefectures": ["01"], "fee": 1200 } ] }
--
-- 都道府県コードは JIS X 0401 の 2 桁（"01"〜"47"）。`rules` に出てこない
-- 都道府県は base_fee。送料無料しきい値（free_threshold）が地域別より優先する。
-- 離島・中継料はこの形では表せない（郵便番号単位が要る）。v1 では扱わず、
-- 将来入れるときは version 2 とする。
--
-- **アプリ側の検証（lib/shipping/region.ts）だけに任せない。** 金額の計算が
-- 読めない jsonb に依存すると、形の壊れた 1 行で送料が静かに基本送料へ
-- 落ちる。CLAUDE.md「認可は RLS と API の両方で行う」と同じ理由で、
-- 形もアプリと DB の両方で見る。

-- ============================================================
-- 1. 形を検査する関数
-- ============================================================
-- 検査制約（check）には副問い合わせが書けないため、関数に切り出して
-- 制約から呼ぶ。
--
-- **短絡評価を当てにしない。** `and` の評価順は決まっていないので、
-- `jsonb_typeof(p->'rules') = 'array' and (select ... jsonb_array_elements(p->'rules'))`
-- と並べると、rules が配列でないときに jsonb_array_elements が例外を投げる
-- 場合がある。case で順序を固定する。
create or replace function is_valid_region_rules(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public as $$
  select case
    when p is null then false
    when jsonb_typeof(p) <> 'object' then false
    -- version は数値の 1。文字列の "1" は通さない（アプリ側の zod は
    -- z.literal(1) で数値しか受けない。DB だけ緩いと食い違う）
    when jsonb_typeof(p->'version') is distinct from 'number' then false
    when p->>'version' is distinct from '1' then false
    -- **`<>` ではなく `is distinct from`。** rules キーが無いと
    -- jsonb_typeof(p->'rules') は null を返し、`null <> 'array'` は真でなく
    -- null になる。case はそれを「満たさない」と見て次へ進み、以降の
    -- 検査も null の配列に対して 0 行を返すため、{"version":1} が通っていた
    when jsonb_typeof(p->'rules') is distinct from 'array' then false
    when jsonb_array_length(p->'rules') > 47 then false
    -- ここから先は rules が配列であることが確定している
    when exists (
      select 1
        from jsonb_array_elements(p->'rules') as r
       where jsonb_typeof(r) <> 'object'
          or jsonb_typeof(r->'prefectures') <> 'array'
          or jsonb_typeof(r->'fee') <> 'number'
    ) then false
    -- ここから先は各要素の型が確定している
    else (
      -- 送料は 0 以上 100000 以下の整数。"1200.5" や "-100" を弾く
      not exists (
        select 1
          from jsonb_array_elements(p->'rules') as r
         where (r->>'fee') !~ '^[0-9]{1,6}$'
            or (r->>'fee')::integer > 100000
      )
      -- 空の prefectures は「どこにも効かないルール」で、設定の取りこぼしに見える
      and not exists (
        select 1
          from jsonb_array_elements(p->'rules') as r
         where jsonb_array_length(r->'prefectures') = 0
            or jsonb_array_length(r->'prefectures') > 47
      )
      and not exists (
        select 1
          from jsonb_array_elements(p->'rules') as r,
               jsonb_array_elements(r->'prefectures') as pref
         where jsonb_typeof(pref) <> 'string'
            or (pref #>> '{}') !~ '^(0[1-9]|[1-3][0-9]|4[0-7])$'
      )
      -- 同じ都道府県が 2 つのルールに出たら、どちらの金額になるかが
      -- 配列の順序で決まる。テナントの画面に順序は見えないので弾く
      and (
        select count(*) = count(distinct pref #>> '{}')
          from jsonb_array_elements(p->'rules') as r,
               jsonb_array_elements(r->'prefectures') as pref
      )
    )
  end
$$;

comment on function is_valid_region_rules(jsonb) is
  'shipping_profiles.region_rules の構造を検査する。検査制約から呼ぶ。';

-- **この関数の EXECUTE は剥がさない。0011 とは逆になる。**
-- 検査制約の式は書き込みを行うロールの権限で評価されるため、0011 のように
-- anon / authenticated から剥がすと、テナント自身の送料保存が
-- 「permission denied for function」で落ちる。引数として渡される jsonb は
-- 呼び出し元が既に持っている値で、真偽しか返さないので何も漏れない。

-- ============================================================
-- 2. 既定値と既存行
-- ============================================================
alter table shipping_profiles
  alter column region_rules set default '{"version": 1, "rules": []}'::jsonb;

-- 0001 の既定値は '{}' で、上の形を満たさない。制約を足す前に整える
update shipping_profiles
   set region_rules = '{"version": 1, "rules": []}'::jsonb
 where not is_valid_region_rules(region_rules);

-- ============================================================
-- 3. 検査制約
-- ============================================================
alter table shipping_profiles
  drop constraint if exists shipping_profiles_region_rules_shape;

alter table shipping_profiles
  add constraint shipping_profiles_region_rules_shape
  check (is_valid_region_rules(region_rules));
