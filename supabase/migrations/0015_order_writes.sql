-- 0015 注文の作成と状態遷移（フェーズ3-4）
-- 出典：docs/06 フェーズ3-4、docs/04 9.1・9.2、docs/05「権限と情報保護」
--
-- 0001 で orders / order_items のテーブルは、0002 で SELECT のポリシーは
-- 揃っている。足りていないのは「誰がどう書けるか」だけ。
--
-- **決済はまだ繋がっていない。** 注文は `pending` で作られ、`paid` へは
-- Stripe の通知でしか進まない（lib/orders/status.ts の TRANSITIONS）。
-- そのため、確保が切れたまま残る注文を畳むバッチをここに置く（下の 5）。

-- ============================================================
-- 1. テナントは自店の注文の「状態」だけ動かせる
-- ============================================================
-- 発送登録・テナント都合の取消はテナントの操作なので、本部の商品審査と
-- 同じく**テナント自身のセッションで書かせる**（0004 の hq_write_products と
-- 同じ考え方。service_role で書くと RLS 側が素通りになり、ポリシーの誤りに
-- 気づけなくなる）。
--
-- ただし金額列は別。注文金額はサーバーが決めたものであって、テナントが
-- 動かしてよいものではない。列ごとの制限はポリシーでは書けないのでトリガで止める。
create policy orders_tenant_update on orders for update
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));

-- **security definer にしないこと。** definer にすると関数内の current_user が
-- 所有者に変わり、is_service_context() が常に真になってガードが素通りする
-- （0010 の products_guard_review_columns()、0011 の inventories_guard_reserved()
-- と同じ理由。ここは実際に is_service_context() を見ているので致命的になる）。
create or replace function orders_guard_columns() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- サーバー処理（service_role）は注文の作成と金額の確定を行う
  if is_service_context() then
    return new;
  end if;

  if new.order_number    is distinct from old.order_number
     or new.buyer_id     is distinct from old.buyer_id
     or new.tenant_id    is distinct from old.tenant_id
     or new.created_at   is distinct from old.created_at then
    raise exception '注文の識別情報は変更できません';
  end if;

  if new.subtotal_incl_tax is distinct from old.subtotal_incl_tax
     or new.shipping_fee   is distinct from old.shipping_fee
     or new.point_discount is distinct from old.point_discount
     or new.total_charged  is distinct from old.total_charged then
    raise exception '注文金額は変更できません';
  end if;

  -- 「どこへ送った注文か」が後から変わってはいけない（0013 の判断と同じ）
  if new.shipping_address is distinct from old.shipping_address then
    raise exception '注文の配送先は変更できません';
  end if;

  -- 注文時点のポイントルールは遡及適用しない（CLAUDE.md 絶対ルール）
  if new.point_rule_snapshot is distinct from old.point_rule_snapshot then
    raise exception '注文時点のポイントルールは変更できません';
  end if;

  return new;
end $$;

create trigger orders_guard_immutable_columns
  before update on orders
  for each row execute function orders_guard_columns();

-- 購入者は「決済前の自分の注文を取り消す」ことだけできる。
--
-- **`using` は変更前の行、`with check` は変更後の行**に効く。この 2 つで
-- 「`pending` から `cancelled` へ」という 1 本の遷移だけを許す。
-- 状態名をアプリだけで絞ると、API を直接叩いて `shipped` にできる。
--
-- 決済後（`paid`）の取消は申請にとどめ、テナントが判断する
-- （発送の準備が始まっている可能性があり、返金も伴う）。
create policy orders_buyer_cancel on orders for update
  using (buyer_id = auth.uid() and status = 'pending')
  with check (buyer_id = auth.uid() and status = 'cancelled');

-- 注文の作成と明細はサーバー処理だけが行う。insert のポリシーを置かない。
--
-- 金額を決めるのはサーバーであって購入者ではない。購入者のセッションから
-- 書ける形にすると、ポリシーの書き方ひとつで金額の改ざん経路になる
-- （商品審査で service_role を避けたのとは逆の判断。あちらは「人が
-- 判断して書くもの」で、こちらは「サーバーが計算して書くもの」）。

-- ============================================================
-- 2. 引当を注文へ付け替える
-- ============================================================
-- 購入手続きの開始（0013）でカートに紐づけて取った引当を、注文の成立と
-- ともに注文へ移す。
--
-- **1 文の UPDATE で決める。** 「読んで、確かめて、書く」に分けると、
-- その隙間で期限切れの解放とぶつかる（0011 の引当と同じ理由）。
-- 期限切れ・解放済みは対象にしない。付け替えた件数を返すので、
-- 呼び出し側が明細数と突き合わせられる。
create or replace function attach_reservations_to_order(
  p_cart_id  uuid,
  p_order_id uuid
)
returns integer
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  update inventory_reservations
     set cart_id = null, order_id = p_order_id
   where cart_id = p_cart_id
     and released_at is null
     and expires_at > now();

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function attach_reservations_to_order(uuid, uuid) is
  'カートに紐づく有効な引当を注文へ移す。付け替えた件数を返す。期限切れは対象外。';

-- 0012 の検査関数とは違い、呼ぶのは service_role だけ。剥がしてよい
-- （0011 の引当関数と同じ扱い）。
revoke all on function attach_reservations_to_order(uuid, uuid) from public, anon, authenticated;
grant execute on function attach_reservations_to_order(uuid, uuid) to service_role;

-- ============================================================
-- 3. 発送登録は状態と記録をまとめて書く
-- ============================================================
-- 状態の更新と `shipments` の挿入を別々の呼び出しにすると、片方だけ
-- 成功したときに「発送済みなのに記録が無い」注文ができる。
-- **`shipments.shipped_at` はポイント確定（発送登録日＋14日）の起点**
-- なので（docs/02 6.1）、記録が無いと確定日が出せない。関数 1 回なら
-- 途中で落ちても両方が巻き戻る。
--
-- **security definer にしないこと。** invoker のままにすると、
-- `orders_tenant_update`（自店の注文だけ）と `shipments_tenant_all`
-- （0002）がそのまま効く。定義を 2 か所に書かずに認可が働く。
--
-- 読んだときの状態（paid）を条件に書くので、2 人の担当者が同じ注文を
-- 開いていても二重に発送登録されない。動かせなければ false。
create or replace function ship_order(
  p_order_id  uuid,
  p_carrier   text default null,
  p_tracking  text default null
)
returns boolean
language plpgsql
set search_path = public, pg_temp as $$
begin
  update orders
     set status = 'shipped'
   where id = p_order_id
     and status = 'paid';

  if not found then
    return false;
  end if;

  insert into shipments (order_id, carrier, tracking_number, shipped_at)
  values (p_order_id, nullif(btrim(p_carrier), ''), nullif(btrim(p_tracking), ''), now());

  return true;
end $$;

comment on function ship_order(uuid, text, text) is
  '発送登録。状態（paid→shipped）と shipments の記録をまとめて書く。動かせなければ false。';

-- テナント自身が呼ぶので authenticated に残す（0012 の検査関数と同じ事情。
-- 0011 の引当関数のように service_role 限定にはできない）。
-- invoker なので、権限があっても RLS が自店の注文しか通さない。
revoke all on function ship_order(uuid, text, text) from public, anon;
grant execute on function ship_order(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- 4. 注文の引当をまとめて解放する
-- ============================================================
-- 使うのは 2 か所。
--   1. 注文の取消（発送前）。押さえたままにすると他の人が買えない
--   2. 注文の作成に失敗して巻き戻すとき（lib/orders/create.ts）。
--      一部だけ付け替わった状態で注文行だけ消すと、有効な引当が
--      宙に浮いて在庫を掴んだまま TTL まで残る
--
-- 解放済み・期限切れは対象にしない（`release_reservation` と同じく、
-- 二重に呼んでも在庫は二重に戻らない）。
create or replace function release_order_reservations(p_order_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_count integer := 0;
  v_id    uuid;
begin
  for v_id in
    select id from inventory_reservations
     where order_id = p_order_id and released_at is null
  loop
    -- 在庫の戻しも含めて 0011 の関数に任せる。ここで
    -- `update inventories` を書くと戻し方が 2 か所になる
    if release_reservation(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

comment on function release_order_reservations(uuid) is
  '注文に紐づく引当をまとめて解放する。解放した件数を返す。二重に呼んでも在庫は二重に戻らない。';

revoke all on function release_order_reservations(uuid) from public, anon, authenticated;
grant execute on function release_order_reservations(uuid) to service_role;

-- ============================================================
-- 5. 確保が切れた「決済待ち」を畳む
-- ============================================================
-- 決済が繋がるまで、注文は作られたあと `pending` のまま動かない。
-- 引当は 15 分で切れて在庫は戻るが、注文行はそのまま残る。購入者の注文
-- 一覧に、永久に決済待ちの行が並ぶことになる（2026-09-19 決定：畳む）。
--
-- **判定は「有効な引当が 1 つも無いこと」。** 経過時間で切ると TTL の値が
-- ここにも書かれることになり、定義が 2 か所になる（lib/inventory/ttl.ts の
-- コメントと同じ理由）。引当の有無で見れば、TTL を変えても追従する。
--
-- 冪等。`status = 'pending'` で絞るので、二重に実行しても 2 回目は 0 件
-- （CLAUDE.md 全般「バッチ処理はすべて冪等」）。
--
-- **決済を繋いだら、ここに「決済処理中」の除外が要る。** Stripe の
-- PaymentIntent が進行中の注文を畳むと、支払い済みなのに取消の注文が残る。
create or replace function expire_pending_orders()
returns integer
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  update orders o
     set status = 'cancelled'
   where o.status = 'pending'
     and not exists (
       select 1
         from inventory_reservations r
        where r.order_id = o.id
          and r.released_at is null
          and r.expires_at > now()
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function expire_pending_orders() is
  '有効な引当が残っていない決済待ちの注文を取消にする。冪等。決済接続後は進行中の決済を除外すること。';

revoke all on function expire_pending_orders() from public, anon, authenticated;
grant execute on function expire_pending_orders() to service_role;

-- ============================================================
-- 6. 索引
-- ============================================================
-- 購入者の注文一覧（新しい順）とテナントの受注一覧（状態で絞って新しい順）。
create index on orders (buyer_id, created_at desc);
create index on orders (tenant_id, status, created_at desc);

-- バッチが毎回 orders を全件見に行かないようにする。
-- 決済待ちは常に少数なので部分索引で足りる。
create index on orders (status) where status = 'pending';
