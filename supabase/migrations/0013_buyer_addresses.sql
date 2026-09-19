-- 0013 配送先住所（フェーズ3）
-- 出典：docs/00 5.1「配送先登録」、docs/05「配送先情報は必要なテナントだけが閲覧できる」
--
-- docs/03 のテーブル一覧に住所が無かった。一方で docs/00 5.1 には購入者の
-- 機能として「配送先登録」があり、5.7 にも「購入者の認証、連絡先、配送先を
-- 管理する」とある。ここで新設する。
--
-- **都道府県はコードで持つ。** 0012 の地域別送料と同じ JIS X 0401 の 2 桁。
-- 名前で持つと「大阪府」「大阪」の表記ゆれで送料の突き合わせが静かに外れ、
-- 金額が変わる。
--
-- **郵便番号はハイフン無しの 7 桁で統一する。** `123-4567` と `1234567` の
-- 両方を許すと、同じ住所が 2 通りの文字列で保存されて突き合わせができない。
-- 全角の直しはアプリ側（lib/addresses/address.ts）で行う。

create table buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null,
  recipient_name text not null,
  phone text not null,
  postal_code text not null,
  prefecture_code text not null,
  city text not null,
  address_line1 text not null,
  address_line2 text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint buyer_addresses_recipient_not_blank check (btrim(recipient_name) <> ''),
  constraint buyer_addresses_city_not_blank check (btrim(city) <> ''),
  constraint buyer_addresses_line1_not_blank check (btrim(address_line1) <> ''),
  constraint buyer_addresses_postal_format check (postal_code ~ '^[0-9]{7}$'),
  constraint buyer_addresses_phone_format check (phone ~ '^0[0-9]{9,10}$'),
  constraint buyer_addresses_prefecture_format
    check (prefecture_code ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$'),
  constraint buyer_addresses_length check (
    length(recipient_name) <= 60
    and length(city) <= 60
    and length(address_line1) <= 100
    and (address_line2 is null or length(address_line2) <= 100)
  )
);

create index on buyer_addresses (buyer_id, created_at desc);

-- 既定の配送先は 1 人につき 1 件まで。
--
-- **部分一意索引で守る。** アプリ側で「他を false にしてから true にする」と
-- 書くと、その隙間で 2 件が既定になる。索引なら DB が拒否する。
create unique index buyer_addresses_one_default
  on buyer_addresses (buyer_id) where is_default;

comment on table buyer_addresses is
  '購入者の配送先。注文には写し取る（orders.shipping_address）。ここを直しても過去の注文は変わらない。';

-- ============================================================
-- 1. RLS
-- ============================================================
-- 自分の住所だけ。テナントも本部もここは読めない。
-- テナントが見るのは注文に写し取られたほう（orders.shipping_address）で、
-- 自店の注文に限られる（docs/05「配送先情報は必要なテナントだけが閲覧できる」）。
alter table buyer_addresses enable row level security;

create policy buyer_addresses_self_all on buyer_addresses for all
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

-- ============================================================
-- 2. 注文に写し取る形
-- ============================================================
-- orders.shipping_address は 0001 で `jsonb not null` とだけ決まっていて、
-- 形が未定義だった。buyer_addresses への外部キーにはしない。購入者が後から
-- 住所を直したり消したりしても、「どこへ送った注文か」が変わってはいけない。
--
-- 0012 の region_rules と同じく version を持たせ、後から形を変えたときに
-- 古い行を読み分けられるようにする。
--
-- **短絡評価を当てにしない。** `and` の評価順は決まっていないので case で
-- 順序を固定する（0012 で同じ罠を踏んだ）。
create or replace function is_valid_shipping_address(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public as $$
  select case
    when p is null then false
    when jsonb_typeof(p) <> 'object' then false
    when jsonb_typeof(p->'version') is distinct from 'number' then false
    when p->>'version' is distinct from '1' then false
    else (
      -- 必須の文字列。空白だけの値も通さない
      not exists (
        select 1
          from unnest(array['recipientName', 'city', 'addressLine1']) as k
         where jsonb_typeof(p->k) is distinct from 'string'
            or btrim(p->>k) = ''
      )
      and length(p->>'recipientName') <= 60
      and length(p->>'city') <= 60
      and length(p->>'addressLine1') <= 100
      -- 建物名は無くてよいが、あるなら文字列
      and (
        p->'addressLine2' is null
        or jsonb_typeof(p->'addressLine2') = 'null'
        or (jsonb_typeof(p->'addressLine2') = 'string' and length(p->>'addressLine2') <= 100)
      )
      -- 正規化済みであること。ハイフン付きや全角は保存前にアプリが直す
      and jsonb_typeof(p->'postalCode') = 'string'
      and (p->>'postalCode') ~ '^[0-9]{7}$'
      and jsonb_typeof(p->'phone') = 'string'
      and (p->>'phone') ~ '^0[0-9]{9,10}$'
      and jsonb_typeof(p->'prefectureCode') = 'string'
      and (p->>'prefectureCode') ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$'
    )
  end
$$;

comment on function is_valid_shipping_address(jsonb) is
  'orders.shipping_address の構造を検査する。検査制約から呼ぶ。';

-- **この関数の EXECUTE は剥がさない。** 0012 と同じ理由で、検査制約の式は
-- 書き込みを行うロールの権限で評価される。剥がすと注文の作成が
-- 「permission denied for function」で落ちる。0011 の引当関数とは逆。

-- 0012 のように既存行を書き換えたりしない。注文の配送先を黙って別の値に
-- すり替えるほうが、移行が失敗して止まるより悪い。形の合わない行があれば
-- ここで落ちるので、その注文を個別に確認すること（現状は 0 件）。
alter table orders
  drop constraint if exists orders_shipping_address_shape;

alter table orders
  add constraint orders_shipping_address_shape
  check (is_valid_shipping_address(shipping_address));
