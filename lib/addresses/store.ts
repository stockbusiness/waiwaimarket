import "server-only";

import type { Address } from "@/lib/addresses/address";
import type { MarketSupabaseClient } from "@/lib/supabase/server";
import type { AddressInput } from "@/lib/validation/address";

/**
 * 配送先の読み書き（docs/00 5.1）。
 *
 * 呼び出し元のセッションのクライアントを受け取る。0013 の
 * `buyer_addresses_self_all` が自分の行だけに絞るので、RLS と API の
 * 二重になる（CLAUDE.md「認可は RLS と API の両方で行う」）。
 */

export type StoredAddress = Address & {
  id: string;
  isDefault: boolean;
};

const COLUMNS =
  "id, recipient_name, phone, postal_code, prefecture_code, city, address_line1, address_line2, is_default";

type Row = {
  id: string;
  recipient_name: string;
  phone: string;
  postal_code: string;
  prefecture_code: string;
  city: string;
  address_line1: string;
  address_line2: string | null;
  is_default: boolean;
};

function toAddress(row: Row): StoredAddress {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    phone: row.phone,
    postalCode: row.postal_code,
    prefectureCode: row.prefecture_code,
    city: row.city,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    isDefault: row.is_default,
  };
}

/** 既定を先頭に、あとは新しい順 */
export async function listAddresses(
  client: MarketSupabaseClient,
): Promise<StoredAddress[]> {
  const { data, error } = await client
    .from("buyer_addresses")
    .select(COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => toAddress(row as Row));
}

export async function getAddress(
  client: MarketSupabaseClient,
  id: string,
): Promise<StoredAddress | null> {
  const { data, error } = await client
    .from("buyer_addresses")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toAddress(data as Row) : null;
}

function toRow(input: AddressInput) {
  return {
    recipient_name: input.recipientName,
    phone: input.phone,
    postal_code: input.postalCode,
    prefecture_code: input.prefectureCode,
    city: input.city,
    address_line1: input.addressLine1,
    address_line2: input.addressLine2,
  };
}

/**
 * 既定を 1 件に保つ。
 *
 * 0013 の部分一意索引 `buyer_addresses_one_default` が 2 件目を拒否するので、
 * **先に他を落としてから立てる**。順序を逆にすると索引に弾かれる。
 */
async function clearDefault(
  client: MarketSupabaseClient,
  buyerId: string,
  exceptId?: string,
): Promise<void> {
  let query = client
    .from("buyer_addresses")
    .update({ is_default: false })
    .eq("buyer_id", buyerId)
    .eq("is_default", true);

  if (exceptId) query = query.neq("id", exceptId);

  const { error } = await query;
  if (error) throw error;
}

export async function createAddress(
  client: MarketSupabaseClient,
  buyerId: string,
  input: AddressInput,
): Promise<{ id: string }> {
  // 最初の 1 件は必ず既定にする。届け先が 1 つしか無いのに
  // 「既定が未設定」と出るのは意味が無い
  const { count, error: countError } = await client
    .from("buyer_addresses")
    .select("id", { count: "exact", head: true });

  if (countError) throw countError;
  const isDefault = input.isDefault || (count ?? 0) === 0;

  if (isDefault) await clearDefault(client, buyerId);

  const { data, error } = await client
    .from("buyer_addresses")
    .insert({ buyer_id: buyerId, ...toRow(input), is_default: isDefault })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id };
}

export type AddressWriteResult = { ok: true } | { ok: false; reason: "not_found" };

export async function updateAddress(
  client: MarketSupabaseClient,
  buyerId: string,
  id: string,
  input: AddressInput,
): Promise<AddressWriteResult> {
  if (input.isDefault) await clearDefault(client, buyerId, id);

  const { data, error } = await client
    .from("buyer_addresses")
    .update({ ...toRow(input), is_default: input.isDefault, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

/**
 * 消す。
 *
 * **過去の注文は変わらない。** 注文には住所を写し取ってあり
 * （orders.shipping_address）、この行を参照していない。
 *
 * 既定を消したら、残りのうち最も新しいものを既定にする。既定が無いまま
 * 残ると、次の購入手続きで毎回選び直すことになる。
 */
export async function deleteAddress(
  client: MarketSupabaseClient,
  id: string,
): Promise<AddressWriteResult> {
  const { data, error } = await client
    .from("buyer_addresses")
    .delete()
    .eq("id", id)
    .select("id, is_default")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  if (data.is_default) {
    const { data: next, error: nextError } = await client
      .from("buyer_addresses")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextError) throw nextError;
    if (next) {
      const { error: promoteError } = await client
        .from("buyer_addresses")
        .update({ is_default: true })
        .eq("id", next.id);
      if (promoteError) throw promoteError;
    }
  }

  return { ok: true };
}
