-- 0014 価格未定の商品と問い合わせ（フェーズ2・5）
-- 出典：docs/00 5.1・5.3、docs/06 フェーズ5-4
--
-- 価格が決まっていない、または公開できない商品を載せたい、という要件。
-- 購入ボタンの代わりに問い合わせボタンを出す。
--
-- **宛先はテナント（2026-09-19 決定）。** docs/00 の「本部の役割：問い合わせ
-- 一次受付」とは少しずれるが、商品の価格を答えられるのはテナントだけで、
-- 本部が一次受付にすると毎回転送が挟まる。本部は全件を読めるようにして
-- 監督する（docs/06 フェーズ5-4「問い合わせ運用の整備」）。本部は書けない。
-- どちらが答えるか決まっていない状態で二重返信が起きるのを避ける。

-- ============================================================
-- 1. 商品の販売形態
-- ============================================================
-- product_variants.price_incl_tax は not null なので、価格未定の商品でも
-- 何か入れるしかない。0 を入れて、この列で意味を切り替える。
-- **0 円を「無料」と読み違えないよう、表示は必ずこの列を見て分岐する。**
--
-- SKU 単位ではなく商品単位にする。同じ商品で「A は価格あり、B は要問い合わせ」
-- という売り方は、購入者から見て何が起きているのか分からない。
create type product_pricing_mode as enum ('fixed', 'inquiry');

alter table products
  add column pricing_mode product_pricing_mode not null default 'fixed';

comment on column products.pricing_mode is
  'fixed は通常販売、inquiry は価格未定・非公開で問い合わせのみ。0014 のトリガがカート投入を拒否する。';

-- ============================================================
-- 2. 問い合わせ商品はカートに入れられない
-- ============================================================
-- **判定は security definer に切り出す。** トリガを invoker のまま書くと、
-- 購入者が読めない商品行への照会が空振りし、「問い合わせ商品ではない」と
-- 判定されて通ってしまう（0008 で踏んだ RLS の罠と同じ構造）。
--
-- ここは current_user を見ないので definer で問題ない
-- （is_active_tenant() と同じ形。products_guard_review_columns() のように
-- current_user でガードする関数とは事情が違う）。
create or replace function is_inquiry_only_variant(p_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
      from product_variants v
      join products p on p.id = v.product_id
     where v.id = p_variant_id
       and p.pricing_mode = 'inquiry'
  );
$$;

comment on function is_inquiry_only_variant(uuid) is
  '指定 SKU の商品が問い合わせのみかどうか。cart_items のトリガから呼ぶ。';

-- **この関数の EXECUTE は剥がさない。0012 と同じで、0011 とは逆になる。**
-- トリガの本体は書き込みを行うロールの権限で走るため、anon /
-- authenticated から剥がすと購入者のカート投入が
-- `permission denied for function is_inquiry_only_variant` で落ちる
-- （ローカルで実測した）。0011 の引当関数は service_role しか呼ばないので
-- 剥がせたが、ここは違う。

create or replace function cart_items_reject_inquiry()
returns trigger
language plpgsql as $$
begin
  if is_inquiry_only_variant(new.variant_id) then
    raise exception 'この商品は価格が未定のため、カートに入れられません'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger cart_items_no_inquiry
  before insert or update of variant_id on cart_items
  for each row execute function cart_items_reject_inquiry();

-- ============================================================
-- 3. 問い合わせ
-- ============================================================
create type inquiry_status as enum ('open', 'answered', 'closed');
create type inquiry_sender_role as enum ('buyer', 'tenant');

-- スレッドの親。
--
-- tenant_id を持たせるのは RLS のため。products を join して判定すると、
-- そのたびに products の RLS も効いてしまう（0008 の罠）。
-- 商品は消せない（0010 でカテゴリーを消さないのと同じ理由）ので、
-- 非正規化しても食い違わない。
create table product_inquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  tenant_id uuid not null references tenants(id) on delete restrict,
  buyer_id uuid not null,
  status inquiry_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on product_inquiries (tenant_id, status, updated_at desc);
create index on product_inquiries (buyer_id, updated_at desc);

comment on table product_inquiries is
  '価格未定の商品への問い合わせ。宛先はテナント、本部は閲覧のみ（2026-09-19 決定）。';

-- 発言。**追記専用。**
--
-- 後から書き換えられると、「何を答えたか」が争点になったときに記録の
-- 意味がなくなる。point_ledger_entries と同じくトリガで止める。
create table product_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references product_inquiries(id) on delete cascade,
  sender_role inquiry_sender_role not null,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),

  constraint inquiry_message_body_not_blank check (btrim(body) <> ''),
  constraint inquiry_message_body_length check (length(body) <= 2000)
);

create index on product_inquiry_messages (inquiry_id, created_at);

create or replace function inquiry_messages_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'product_inquiry_messages is append-only.';
end $$;

create trigger inquiry_messages_no_update before update on product_inquiry_messages
  for each row execute function inquiry_messages_append_only();
create trigger inquiry_messages_no_delete before delete on product_inquiry_messages
  for each row execute function inquiry_messages_append_only();
create trigger inquiry_messages_no_truncate before truncate on product_inquiry_messages
  for each statement execute function inquiry_messages_append_only();

-- テナントが動かしてよいのは状態と更新日時だけ。
--
-- `inquiries_tenant_update` は「自店宛てであること」しか見ないため、
-- それだけだと buyer_id を別の利用者へ書き換えて、自分のスレッドを
-- 他人に見せられる。列ごとの制限はポリシーでは書けないのでトリガで止める。
--
-- **security definer にしないこと。** ここは current_user を見ていないので
-- 動きは変わらないが、products_guard_review_columns() / inventories_guard_reserved()
-- と同じ並びに置いてあるため、後から is_service_context() を足したときに
-- 素通りするのを避ける。
create or replace function inquiries_guard_columns() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.tenant_id is distinct from old.tenant_id
     or new.buyer_id is distinct from old.buyer_id
     or new.created_at is distinct from old.created_at then
    raise exception '問い合わせの宛先・対象商品・作成日時は変更できません';
  end if;
  return new;
end $$;

create trigger inquiries_no_rebinding
  before update on product_inquiries
  for each row execute function inquiries_guard_columns();

-- 発言が入ったら親の状態と更新日時を動かす。
--
-- アプリ側で 2 回書くと、片方だけ成功したときに一覧の並びが狂う。
-- 「誰が最後に話したか」で状態が決まるので、ここで一緒に更新する。
-- **分岐の値に型を書く。** 引用符付きの literal はどれも unknown なので、
-- case 全体の型が text に決まり、`status` へ代入したところで
-- 「column "status" is of type inquiry_status but expression is of type text」
-- で落ちる。1 通目の挿入が必ず失敗するのに、トリガの中なので
-- 原因がメッセージからしか分からない（ローカルで実際に踏んだ）。
create or replace function inquiry_touch_thread() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp as $$
begin
  update product_inquiries
     set status = case
                    -- 完了後は動かさない
                    when status = 'closed' then 'closed'::inquiry_status
                    when new.sender_role = 'tenant' then 'answered'::inquiry_status
                    -- 購入者が追記したら未回答へ戻す
                    else 'open'::inquiry_status
                  end,
         updated_at = now()
   where id = new.inquiry_id;
  return new;
end $$;

create trigger inquiry_messages_touch after insert on product_inquiry_messages
  for each row execute function inquiry_touch_thread();

-- ============================================================
-- 4. RLS
-- ============================================================
alter table product_inquiries         enable row level security;
alter table product_inquiry_messages  enable row level security;

-- 購入者：自分の問い合わせだけ。作成もできる
create policy inquiries_buyer_read on product_inquiries for select
  using (buyer_id = auth.uid());

-- 作成できるのは承認済みテナントの商品に対してだけ。
-- 商品が読めるかどうか（RLS）とは別に、ここでも確かめる
create policy inquiries_buyer_insert on product_inquiries for insert
  with check (buyer_id = auth.uid() and is_active_tenant(tenant_id));

-- 削除のポリシーは置かない。
--
-- 最初は「発言が 1 件も入っていない自分のスレッドなら消せる」という
-- ポリシーを書いた（1 通目の挿入に失敗したときの戻し道のつもりだった）。
-- **これは policy の相互参照になって動かない。** product_inquiries の
-- ポリシーが product_inquiry_messages を引き、その発言側のポリシーが
-- product_inquiries を引くため、PostgreSQL が
-- 「infinite recursion detected in policy for relation "product_inquiries"」
-- で**テナントの返信まで**拒否する。消す側だけでなく、輪に入った操作が
-- 全部落ちる。ローカルで実際に踏んだ。
--
-- 戻し道そのものが要らなくなるよう、スレッドと 1 通目は
-- `create_product_inquiry()`（下）で 1 回の呼び出しにまとめてある。

-- テナント：自店宛てを読み、状態を変えられる
create policy inquiries_tenant_read on product_inquiries for select
  using (tenant_id in (select auth_tenant_ids()));

create policy inquiries_tenant_update on product_inquiries for update
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));

-- 本部：全件を読めるが書けない（2026-09-19 決定）
create policy inquiries_hq_read on product_inquiries for select
  using (is_hq_operator());

-- 発言：親を読める人が読める。書けるのは当事者だけ。
--
-- ここは**副問い合わせに RLS がかかることを利用している**。0008 で踏んだ罠
-- （ポリシーの中から引いた表にもポリシーが効く）と同じ仕組みだが、今回は
-- それが欲しい挙動。product_inquiries を読めない人には 0 行に見えるので、
-- 購入者・当該テナント・本部の判定をここで書き直さずに済む。
create policy inquiry_messages_read on product_inquiry_messages for select
  using (
    exists (
      select 1 from product_inquiries i
       where i.id = product_inquiry_messages.inquiry_id
    )
  );

-- 購入者の発言。sender_id を偽れないようにする
create policy inquiry_messages_buyer_insert on product_inquiry_messages for insert
  with check (
    sender_role = 'buyer'
    and sender_id = auth.uid()
    and exists (
      select 1 from product_inquiries i
       where i.id = product_inquiry_messages.inquiry_id
         and i.buyer_id = auth.uid()
         and i.status <> 'closed'
    )
  );

-- テナントの発言
create policy inquiry_messages_tenant_insert on product_inquiry_messages for insert
  with check (
    sender_role = 'tenant'
    and sender_id = auth.uid()
    and exists (
      select 1 from product_inquiries i
       where i.id = product_inquiry_messages.inquiry_id
         and i.tenant_id in (select auth_tenant_ids())
         and i.status <> 'closed'
    )
  );

-- 本部が発言するポリシーは置かない。宛先をテナントにしたため、本部も
-- 返信できると、どちらが答えるか決まっていない状態で二重返信が起きる。

-- ============================================================
-- 5. スレッドと 1 通目をまとめて作る
-- ============================================================
-- アプリから 2 回に分けて書くと、1 通目で落ちたときに発言が 0 件の
-- スレッドが残る。店側は何を聞かれたのか分からないまま未回答を抱える。
-- 関数 1 回なら途中で落ちても両方が巻き戻る。
--
-- **security definer にする。** 呼び出し元の権限のままだと、作った直後の
-- 親行を発言側のポリシーが `exists (select ... from product_inquiries ...)`
-- で引き直すことになり、参照が絡む。definer にして中で自前に確かめる。
--
-- definer なので **引数の buyer_id は受け取らない。** 誰として立てるかは
-- auth.uid() だけで決める。引数にすると、他人になりすませる。
-- current_user は見ない（ここで見ると definer では所有者に変わり、
-- 判定が素通りする。products_guard_review_columns() のコメント参照）。
create or replace function create_product_inquiry(p_product_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_buyer   uuid := auth.uid();
  v_tenant  uuid;
  v_id      uuid;
begin
  if v_buyer is null then
    raise exception 'ログインが必要です' using errcode = 'insufficient_privilege';
  end if;

  -- 公開されている「問い合わせのみ」の商品に限る。definer で RLS を
  -- 通らないぶん、公開の条件（承認済み商品かつ承認済みテナント）を
  -- ここで書き下す。products_public_read と同じ条件
  select p.tenant_id into v_tenant
    from products p
   where p.id = p_product_id
     and p.status = 'approved'
     and p.pricing_mode = 'inquiry'
     and is_active_tenant(p.tenant_id);

  if v_tenant is null then
    raise exception '対象の商品が見つかりません' using errcode = 'no_data_found';
  end if;

  insert into product_inquiries (product_id, tenant_id, buyer_id)
  values (p_product_id, v_tenant, v_buyer)
  returning id into v_id;

  -- 本文の形（空白だけ・長すぎ）は検査制約が見る
  insert into product_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (v_id, 'buyer', v_buyer, p_body);

  return v_id;
end $$;

comment on function create_product_inquiry(uuid, text) is
  'スレッドと 1 通目をまとめて作る。宛先は商品から引く。購入者は auth.uid()。';

-- 0011 の引当関数と違い、**呼ぶのは購入者本人**なので authenticated に残す。
-- anon から剥がすのは、ログインしていない呼び出しを関数に入る前に止めるため
-- （中の auth.uid() の検査と二重になる）。
revoke all on function create_product_inquiry(uuid, text) from public, anon;
grant execute on function create_product_inquiry(uuid, text) to authenticated, service_role;
