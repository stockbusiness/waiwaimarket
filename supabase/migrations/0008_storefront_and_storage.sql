-- 0008 店舗ページ・特商法表記・Storage ポリシー
-- 出典：docs/00 5.2・8.2、docs/06 フェーズ1-5
--
-- 0004 で stores に UPDATE ポリシーだけを置いていたため、テナントが店舗を
-- 新規作成できなかった。あわせて特商法表記の公開読み取りと、商品画像・
-- 本人確認ファイルの Storage ポリシーを追加する。

-- ============================================================
-- 1. 店舗
-- ============================================================
alter table stores
  add constraint stores_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  add constraint stores_display_name_not_blank
    check (length(btrim(display_name)) > 0);

-- 0004 は for update しか置いていない。出店申請後に店舗ページを作れるようにする。
-- 承認前でも準備できてよい（公開は stores_public_read が is_active_tenant で
-- 縛っているため、未承認テナントの店舗は is_public でも表に出ない）。
create policy stores_tenant_insert on stores for insert
  with check (is_tenant_owner(tenant_id));

-- ============================================================
-- 2. 特商法表記の公開
-- ============================================================
-- 特定商取引法に基づく表記は公開が前提の情報であり、店舗ページに
-- 掲示する必要がある（docs/00 5.2、docs/06 フェーズ1-5）。
-- 公開するのは承認済みテナントの分のみ。
--
-- 注意：docs/00 5.4 は「テナント担当者は事業者情報を閲覧不可」としているが、
-- このポリシーにより承認済みテナントの事業者情報は誰でも読めるようになる。
-- 法令上の公開が必要な情報であるため文字どおりには両立しないが、担当者に対する制限は
-- 「テナント管理画面での閲覧・編集」に対するものと解釈した。
-- 編集は引き続き legal_owner_all によりテナント管理者のみ。
--
-- 判定に is_active_tenant() を使う点が重要。ポリシーの using 式は呼び出し元の
-- 権限で評価されるため、ここで tenants を直接 exists で引くと tenants 側の RLS が
-- かかり、匿名からは常に偽になる（＝特商法表記が誰にも見えない）。
-- is_active_tenant() は security definer なのでこの問題を受けない。
create policy legal_public_read on tenant_legal_profiles for select
  using (is_active_tenant(tenant_id));

-- ============================================================
-- 3. Storage
-- ============================================================
-- docs/00 8.2「商品画像と本人確認関連ファイルには Storage Policy を設定する」
--
-- 置き場所の規約：どちらのバケットも先頭フォルダをテナントIDにする。
--   product-images/<tenant_id>/<product_id>/<file>
--   tenant-documents/<tenant_id>/<file>
-- ポリシーは先頭フォルダを見て所属を判定する。

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('tenant-documents', 'tenant-documents', false)
on conflict (id) do nothing;

-- 先頭フォルダをテナントIDとして安全に取り出す。
-- UUID でないパスが来ても例外にせず NULL を返す。
create or replace function storage_tenant_folder(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp as $$
declare
  v_folder text;
  v_id uuid;
begin
  v_folder := (storage.foldername(object_name))[1];
  if v_folder is null then
    return null;
  end if;
  begin
    v_id := v_folder::uuid;
  exception when others then
    return null;
  end;
  return v_id;
end $$;

comment on function storage_tenant_folder(text) is
  'Storage のオブジェクト名の先頭フォルダをテナントIDとして取り出す。UUID でなければ NULL。';

-- ---- 商品画像（公開バケット）----
-- 読み取りは公開。バケット自体が public なので CDN からも配信される。
create policy product_images_public_read on storage.objects for select
  using (bucket_id = 'product-images');

-- 書き込みは自店舗のフォルダ配下のみ。担当者も可（商品画像の登録は
-- テナント担当者の範囲：docs/00 5.4）。
create policy product_images_tenant_insert on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and storage_tenant_folder(name) in (select auth_tenant_ids())
    and is_active_tenant(storage_tenant_folder(name))
  );

create policy product_images_tenant_update on storage.objects for update
  using (
    bucket_id = 'product-images'
    and storage_tenant_folder(name) in (select auth_tenant_ids())
  )
  with check (
    bucket_id = 'product-images'
    and storage_tenant_folder(name) in (select auth_tenant_ids())
  );

create policy product_images_tenant_delete on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and storage_tenant_folder(name) in (select auth_tenant_ids())
  );

-- ---- 本人確認関連ファイル（非公開バケット）----
-- 事業者情報にあたるため、閲覧はテナント管理者と本部に限る（docs/00 5.4）。
create policy tenant_documents_owner_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and (
      is_tenant_owner(storage_tenant_folder(name))
      or is_hq_operator()
    )
  );

create policy tenant_documents_owner_insert on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and is_tenant_owner(storage_tenant_folder(name))
  );

create policy tenant_documents_owner_delete on storage.objects for delete
  using (
    bucket_id = 'tenant-documents'
    and is_tenant_owner(storage_tenant_folder(name))
  );

-- 本部管理者は違反対応のために削除できる
create policy tenant_documents_hq_admin_delete on storage.objects for delete
  using (bucket_id = 'tenant-documents' and is_hq_admin());
