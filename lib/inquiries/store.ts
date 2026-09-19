import "server-only";

import type { InquirySenderRole, InquiryStatus } from "@/lib/supabase/database.types";
import type { MarketSupabaseClient } from "@/lib/supabase/server";

/**
 * 問い合わせの読み書き（docs/00 5.1・5.3、docs/06 フェーズ5-4）。
 *
 * 呼び出し元のセッションのクライアントを受け取る。service_role は使わない。
 * 0014 のポリシーが購入者・テナント・本部をそれぞれ絞るので、API 側の認可と
 * RLS の二重になる（CLAUDE.md「認可は RLS と API の両方で行う」）。
 *
 * **埋め込み（PostgREST の `select("...products(...)")`）を使わない。**
 * 埋め込んだ先にも RLS がかかるため、本部が全件を読むときに商品名だけ
 * 欠けるといった食い違いが起きる。商品IDで引き直して突き合わせる
 * （lib/products/public.ts と同じ形）。
 */

export type InquirySummary = {
  id: string;
  productId: string;
  productTitle: string;
  tenantId: string;
  tenantName: string | null;
  status: InquiryStatus;
  updatedAt: string;
  /** 一覧に出す最後の発言。無いことはないが、読めない場合に備えて null 許容 */
  lastMessage: { senderRole: InquirySenderRole; body: string } | null;
};

export type InquiryMessage = {
  id: string;
  senderRole: InquirySenderRole;
  body: string;
  createdAt: string;
};

export type InquiryDetail = Omit<InquirySummary, "lastMessage"> & {
  buyerId: string;
  createdAt: string;
  messages: InquiryMessage[];
};

const COLUMNS = "id, product_id, tenant_id, buyer_id, status, created_at, updated_at";

type Row = {
  id: string;
  product_id: string;
  tenant_id: string;
  buyer_id: string;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
};

async function loadProductTitles(
  client: MarketSupabaseClient,
  productIds: string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await client
    .from("products")
    .select("id, title")
    .in("id", productIds);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.title]));
}

/**
 * テナントの表示名。
 *
 * **購入者は `tenants` を読めない**（0004 は自分の所属テナントか本部だけに
 * 開けている）。購入者に見せられるのは公開の店舗ページ（`stores`）の名前
 * なので、まずそちらを引き、読めた分を優先する。店舗ページを作っていない
 * テナントもあるため、残りを `tenants` で補う（購入者からは 0 行に見える）。
 *
 * 名前が引けなくても null にするだけでスレッドは読める。店名は付随情報で、
 * 本体は商品名とやり取りの中身。
 */
async function loadTenantNames(
  client: MarketSupabaseClient,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tenantIds.length === 0) return map;

  const [stores, tenants] = await Promise.all([
    client.from("stores").select("tenant_id, display_name").in("tenant_id", tenantIds),
    client.from("tenants").select("id, name").in("id", tenantIds),
  ]);

  for (const row of tenants.data ?? []) map.set(row.id, row.name);
  // 店舗ページの表示名のほうが購入者に馴染みがあるので後勝ちにする
  for (const row of stores.data ?? []) map.set(row.tenant_id, row.display_name);

  return map;
}

/** 一覧の最後の 1 発言。件数が少ないので、まとめて引いて JS で畳む */
async function loadLastMessages(
  client: MarketSupabaseClient,
  inquiryIds: string[],
): Promise<Map<string, { senderRole: InquirySenderRole; body: string }>> {
  const map = new Map<string, { senderRole: InquirySenderRole; body: string }>();
  if (inquiryIds.length === 0) return map;

  const { data, error } = await client
    .from("product_inquiry_messages")
    .select("inquiry_id, sender_role, body, created_at")
    .in("inquiry_id", inquiryIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  for (const row of data ?? []) {
    // 降順で来るので、最初に見つかったものが最後の発言
    if (!map.has(row.inquiry_id)) {
      map.set(row.inquiry_id, { senderRole: row.sender_role, body: row.body });
    }
  }
  return map;
}

async function decorate(
  client: MarketSupabaseClient,
  rows: Row[],
): Promise<InquirySummary[]> {
  const [titles, tenants, lastMessages] = await Promise.all([
    loadProductTitles(client, [...new Set(rows.map((row) => row.product_id))]),
    loadTenantNames(client, [...new Set(rows.map((row) => row.tenant_id))]),
    loadLastMessages(client, rows.map((row) => row.id)),
  ]);

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    // 商品が読めないことはない（0010 でカテゴリーと同じく消さない方針）が、
    // 販売停止で購入者から見えなくなる。問い合わせ自体は残す
    productTitle: titles.get(row.product_id) ?? "（取り扱いが終了しました）",
    tenantId: row.tenant_id,
    tenantName: tenants.get(row.tenant_id) ?? null,
    status: row.status,
    updatedAt: row.updated_at,
    lastMessage: lastMessages.get(row.id) ?? null,
  }));
}

type ListScope =
  | { by: "buyer"; buyerId: string }
  | { by: "tenant"; tenantIds: string[] }
  | { by: "hq" };

/**
 * 一覧。並びは更新の新しい順。
 *
 * テナント向けは未回答を先に出す（`open` → `answered` → `closed`）。
 * 状態は enum なので、宣言順のまま昇順で並ぶ。
 */
export async function listInquiries(
  client: MarketSupabaseClient,
  scope: ListScope,
  filter?: InquiryStatus,
): Promise<InquirySummary[]> {
  let builder = client.from("product_inquiries").select(COLUMNS);

  if (scope.by === "buyer") builder = builder.eq("buyer_id", scope.buyerId);
  if (scope.by === "tenant") {
    if (scope.tenantIds.length === 0) return [];
    builder = builder.in("tenant_id", scope.tenantIds);
  }
  if (filter) builder = builder.eq("status", filter);

  const { data, error } = await builder
    .order("status")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return decorate(client, (data ?? []) as Row[]);
}

/** テナントの画面上部に出す未回答の件数 */
export async function countOpenInquiries(
  client: MarketSupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count, error } = await client
    .from("product_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "open");

  if (error) throw error;
  return count ?? 0;
}

/** 1 件。読めなければ null（RLS が絞る）。呼び出し側が 404 にする */
export async function getInquiry(
  client: MarketSupabaseClient,
  id: string,
): Promise<InquiryDetail | null> {
  const { data, error } = await client
    .from("product_inquiries")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as Row;
  const [[summary], messages] = await Promise.all([
    decorate(client, [row]),
    client
      .from("product_inquiry_messages")
      .select("id, sender_role, body, created_at")
      .eq("inquiry_id", id)
      .order("created_at"),
  ]);

  if (messages.error) throw messages.error;

  return {
    ...summary,
    buyerId: row.buyer_id,
    createdAt: row.created_at,
    messages: (messages.data ?? []).map((message) => ({
      id: message.id,
      senderRole: message.sender_role,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}

export type InquiryWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "not_inquiry_product" | "closed" };

/**
 * 問い合わせを立てて、1 通目を入れる。
 *
 * **スレッドと 1 通目は DB 側の 1 回の呼び出しにまとめる**
 * （0014 の `create_product_inquiry()`）。アプリから 2 回に分けて書くと、
 * 1 通目で落ちたときに発言が 0 件のスレッドが残り、店側は何を聞かれたのか
 * 分からないまま未回答を抱える。
 *
 * 宛先のテナントも購入者も関数の中で決まる。クライアントから受け取った
 * ものをそのまま入れると、任意のテナント宛てに、他人の名前でスレッドを
 * 作れる（カート投入で SKU からテナントを引くのと同じ理由）。
 *
 * 対象は `pricing_mode = 'inquiry'` の商品だけ。通常の商品にこの経路を
 * 開けると、「カートに入れて買う」という導線の外に、店ごとに形式の違う
 * やり取りが増える。問い合わせ窓口そのものは docs/06 フェーズ5-4 で別に作る。
 *
 * 先に商品を読んで理由を分けるのは、関数が投げる例外からは
 * 「見つからない」と「問い合わせを受け付けていない」を区別できないため。
 * 判定そのものは関数側にもあるので、ここを抜けても通らない。
 */
export async function createInquiry(
  client: MarketSupabaseClient,
  params: { productId: string; body: string },
): Promise<InquiryWriteResult> {
  // 公開されている商品かは RLS（products_public_read）に判定させる
  const { data: product, error } = await client
    .from("products")
    .select("id, pricing_mode")
    .eq("id", params.productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) return { ok: false, reason: "not_found" };
  if (product.pricing_mode !== "inquiry") {
    return { ok: false, reason: "not_inquiry_product" };
  }

  const { data, error: createError } = await client.rpc("create_product_inquiry", {
    p_product_id: params.productId,
    p_body: params.body,
  });

  if (createError) throw createError;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, id: data };
}

/**
 * 発言を足す。
 *
 * 状態（回答済み・未回答へ戻す）と更新日時は 0014 の
 * `inquiry_touch_thread()` が動かす。ここから 2 回書かない。片方だけ
 * 成功したときに一覧の並びが狂う。
 *
 * 完了したスレッドへの追記は 0014 のポリシーが 0 行に落とすが、
 * 「権限が無い」としか分からないため、先に状態を読んで理由を返す。
 */
export async function addMessage(
  client: MarketSupabaseClient,
  params: {
    inquiryId: string;
    senderRole: InquirySenderRole;
    senderId: string;
    body: string;
  },
): Promise<InquiryWriteResult> {
  const { data: inquiry, error } = await client
    .from("product_inquiries")
    .select("id, status")
    .eq("id", params.inquiryId)
    .maybeSingle();

  if (error) throw error;
  if (!inquiry) return { ok: false, reason: "not_found" };
  if (inquiry.status === "closed") return { ok: false, reason: "closed" };

  const { data, error: insertError } = await client
    .from("product_inquiry_messages")
    .insert({
      inquiry_id: params.inquiryId,
      sender_role: params.senderRole,
      sender_id: params.senderId,
      body: params.body,
    })
    .select("id")
    .maybeSingle();

  if (insertError) throw insertError;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, id: data.id };
}

/**
 * 完了にする・再開する（テナントのみ）。
 *
 * **読んだときの状態を条件に書く。** 商品審査（lib/products/review.ts）と
 * 同じ形。2 人の担当者が同じスレッドを開いていると、後から押したほうが
 * 前の判断を黙って上書きしてしまう。
 */
export async function setInquiryStatus(
  client: MarketSupabaseClient,
  params: { inquiryId: string; from: InquiryStatus; to: InquiryStatus },
): Promise<InquiryWriteResult> {
  const { data, error } = await client
    .from("product_inquiries")
    .update({ status: params.to, updated_at: new Date().toISOString() })
    .eq("id", params.inquiryId)
    .eq("status", params.from)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true, id: data.id };
}
