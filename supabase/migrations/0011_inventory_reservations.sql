-- 0011 在庫引当・自動解放（フェーズ2-3）
-- 出典：docs/06 4.2・フェーズ2-3、docs/05「在庫1点の商品を同時購入しても1件だけ成立する」
--
-- 0003 で下ごしらえは済んでいる（TTL 15 分の既定値、reserved <= quantity の
-- 制約、引当中の索引）。ここでは処理本体を置く。
--
-- **引当は 1 文の UPDATE で決める。**
--   update inventories set reserved_quantity = reserved_quantity + n
--    where variant_id = v and quantity - reserved_quantity >= n
-- この UPDATE が行ロックを取るため、同時に走った 2 つ目は 1 つ目の確定を
-- 待ってから条件を評価し直す。0 件なら在庫不足。アプリ側で「読んで、
-- 確かめて、書く」と書くと、その隙間で二重に売れる。
--
-- **security definer にしない。** 実行権限は service_role だけに与えるが、
-- 万一 authenticated へ広げてしまっても、invoker なら RLS と
-- inventories_guard_reserved トリガが効いて書き込みを拒否する。
-- definer にするとその最後の壁が無くなる。

-- ============================================================
-- 1. 期限切れの引当をその場で解放する
-- ============================================================
-- 引当の直前に呼ぶ。これをしないと、バッチが回るまで在庫が押さえられた
-- ままになり、正しさがバッチの間隔に依存する。バッチは後片付けであって
-- 正しさの担保ではない、という形にしておく。
create or replace function release_expired_for_variant(p_variant_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_total integer;
begin
  with expired as (
    update inventory_reservations
       set released_at = now()
     where variant_id = p_variant_id
       and released_at is null
       and expires_at <= now()
    returning quantity
  )
  select coalesce(sum(quantity), 0) into v_total from expired;

  if v_total > 0 then
    -- greatest で 0 を下回らせない。reserved_quantity >= 0 の検査制約に
    -- 引っかかって、引当そのものが落ちるのを避ける
    update inventories
       set reserved_quantity = greatest(0, reserved_quantity - v_total)
     where variant_id = p_variant_id;
  end if;

  return v_total;
end $$;

comment on function release_expired_for_variant(uuid) is
  '指定 SKU の期限切れ引当を解放し、解放した数量の合計を返す。引当の直前に呼ぶ。';

-- ============================================================
-- 2. 引当
-- ============================================================
-- 在庫が足りなければ null を返す（例外にしない）。在庫切れは異常ではなく
-- 通常の結果で、呼び出し側は「在庫なし」として扱えばよい。
create or replace function reserve_inventory(
  p_variant_id uuid,
  p_quantity   integer,
  p_cart_id    uuid default null,
  p_order_id   uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception '引当数は 1 以上で指定してください';
  end if;
  if p_cart_id is null and p_order_id is null then
    raise exception '引当にはカートか注文の指定が必要です';
  end if;

  perform release_expired_for_variant(p_variant_id);

  update inventories
     set reserved_quantity = reserved_quantity + p_quantity
   where variant_id = p_variant_id
     and quantity - reserved_quantity >= p_quantity;

  if not found then
    return null;
  end if;

  -- expires_at は 0003 の既定値（now() + 15 分）に任せる。
  -- TTL の値をここに書くと定義が 2 か所になる
  insert into inventory_reservations (variant_id, cart_id, order_id, quantity)
  values (p_variant_id, p_cart_id, p_order_id, p_quantity)
  returning id into v_id;

  return v_id;
end $$;

comment on function reserve_inventory(uuid, integer, uuid, uuid) is
  '在庫を引き当てる。成功なら引当ID、在庫不足なら NULL。TTL は 0003 の既定値（15分）。';

-- ============================================================
-- 3. 明示的な解放
-- ============================================================
-- カートから外す、購入手続きをやめる、注文が成立して実在庫へ移す、など。
-- 既に解放済みなら false を返すだけで、二重に戻さない。
create or replace function release_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_variant_id uuid;
  v_quantity   integer;
begin
  update inventory_reservations
     set released_at = now()
   where id = p_reservation_id
     and released_at is null
  returning variant_id, quantity into v_variant_id, v_quantity;

  if v_variant_id is null then
    return false;
  end if;

  update inventories
     set reserved_quantity = greatest(0, reserved_quantity - v_quantity)
   where variant_id = v_variant_id;

  return true;
end $$;

comment on function release_reservation(uuid) is
  '引当を解放する。既に解放済みなら false（二重に戻さない）。';

-- ============================================================
-- 4. 解放バッチ
-- ============================================================
-- 期限切れをまとめて解放する。released_at is null で絞るため、
-- 二重に実行しても 2 回目は 0 件になる（CLAUDE.md「バッチ処理は冪等」）。
create or replace function release_expired_reservations()
returns integer
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  with expired as (
    update inventory_reservations
       set released_at = now()
     where released_at is null
       and expires_at <= now()
    returning variant_id, quantity
  ),
  totals as (
    select variant_id, sum(quantity) as total, count(*) as rows_released
    from expired
    group by variant_id
  ),
  applied as (
    update inventories i
       set reserved_quantity = greatest(0, i.reserved_quantity - t.total)
      from totals t
     where i.variant_id = t.variant_id
    returning 1
  )
  -- applied は参照しなくても実行される（PostgreSQL は WITH 内の
  -- データ変更文を必ず 1 回完了させる）。件数だけ totals から取る
  select coalesce((select sum(rows_released) from totals), 0) into v_count;

  return v_count;
end $$;

comment on function release_expired_reservations() is
  '期限切れの引当をまとめて解放し、解放した件数を返す。冪等（2回目は 0 件）。';

-- ============================================================
-- 5. 実行権限
-- ============================================================
-- サーバー処理だけが呼べるようにする。匿名・ログイン利用者には与えない。
-- 0004 のコメントどおり「引当と解放は service_role 経由のサーバー処理のみ」。
--
-- **`from public` だけでは足りない。** Supabase は
--   alter default privileges in schema public grant all on functions
--     to anon, authenticated, service_role
-- を設定してあるため、public スキーマに関数を作った時点で anon と
-- authenticated に EXECUTE が「明示的に」付く。PUBLIC 経由ではないので、
-- `revoke ... from public` では外れない（ローカルの PostgreSQL で
-- pg_default_acl と proacl を見て確認した）。名指しで剥がすこと。
revoke all on function release_expired_for_variant(uuid) from public, anon, authenticated;
revoke all on function reserve_inventory(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function release_reservation(uuid) from public, anon, authenticated;
revoke all on function release_expired_reservations() from public, anon, authenticated;

grant execute on function release_expired_for_variant(uuid) to service_role;
grant execute on function reserve_inventory(uuid, integer, uuid, uuid) to service_role;
grant execute on function release_reservation(uuid) to service_role;
grant execute on function release_expired_reservations() to service_role;

-- バッチが毎回この索引を使う。0003 の索引は variant_id 単位なので、
-- 期限で全件を走査する経路にも索引を置く
create index if not exists inventory_reservations_expiring_idx
  on inventory_reservations (expires_at) where released_at is null;
