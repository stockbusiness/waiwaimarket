/**
 * DB の型定義。
 *
 * 暫定的に手書きで、フェーズ1 で触れるテーブルだけを定義している。
 * Supabase プロジェクトが用意できたら
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
 * で置き換える。手書きのうちは、未定義のテーブルを触るとコンパイルエラーになり、
 * フェーズをまたいだ実装に気づけるという副次的な効果もある。
 */

export type HqRole = "hq_admin" | "hq_operator";
export type OrderStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";
export type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "suspended";
/**
 * 販売形態（0014）。`inquiry` は価格未定・非公開で、問い合わせのみ受ける。
 * `product_variants.price_incl_tax` は not null なので 0 が入るが、
 * **0 円を「無料」と読み違えないよう、表示は必ずこの列で分岐する。**
 */
export type ProductPricingMode = "fixed" | "inquiry";
export type InquiryStatus = "open" | "answered" | "closed";
export type InquirySenderRole = "buyer" | "tenant";
/** 台帳の増減の種類（docs/02 6.2） */
export type PointEntryType =
  | "earn_pending"
  | "earn_confirmed"
  | "spend"
  | "spend_refund"
  | "earn_reversal"
  | "expire"
  | "adjustment";
export type PointLotStatus =
  | "pending"
  | "available"
  | "exhausted"
  | "expired"
  | "reversed";
export type PointRuleScope = "base" | "product" | "store" | "campaign";
export type TenantMemberRole = "owner" | "staff";
export type TenantStatus =
  | "applied"
  | "under_review"
  | "approved"
  | "suspended"
  | "rejected";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      hq_members: {
        Row: {
          user_id: string;
          role: HqRole;
          display_name: string;
          is_active: boolean;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role: HqRole;
          display_name: string;
          is_active?: boolean;
          invited_by?: string | null;
        };
        Update: {
          role?: HqRole;
          display_name?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          status: TenantStatus;
          stripe_account_id: string | null;
          stripe_charges_enabled: boolean;
          stripe_payouts_enabled: boolean;
          fee_rate: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: TenantStatus;
        };
        Update: {
          name?: string;
          status?: TenantStatus;
          stripe_account_id?: string | null;
          stripe_charges_enabled?: boolean;
          stripe_payouts_enabled?: boolean;
        };
        Relationships: [];
      };
      stores: {
        Row: {
          id: string;
          tenant_id: string;
          slug: string;
          display_name: string;
          description: string | null;
          logo_path: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          slug: string;
          display_name: string;
          description?: string | null;
          logo_path?: string | null;
          is_public?: boolean;
        };
        Update: {
          slug?: string;
          display_name?: string;
          description?: string | null;
          logo_path?: string | null;
          is_public?: boolean;
        };
        Relationships: [];
      };
      tenant_legal_profiles: {
        Row: {
          tenant_id: string;
          legal_name: string;
          representative_name: string;
          address: string;
          phone: string;
          email: string;
          invoice_registration_number: string | null;
          return_policy: string | null;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          legal_name: string;
          representative_name: string;
          address: string;
          phone: string;
          email: string;
          invoice_registration_number?: string | null;
          return_policy?: string | null;
        };
        Update: {
          legal_name?: string;
          representative_name?: string;
          address?: string;
          phone?: string;
          email?: string;
          invoice_registration_number?: string | null;
          return_policy?: string | null;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          event_id: string;
          type: string;
          payload: Json;
          received_at: string;
          processed_at: string | null;
          process_error: string | null;
          attempts: number;
        };
        Insert: {
          event_id: string;
          type: string;
          payload: Json;
          processed_at?: string | null;
          process_error?: string | null;
          attempts?: number;
        };
        Update: {
          processed_at?: string | null;
          process_error?: string | null;
          attempts?: number;
        };
        Relationships: [];
      };
      tenant_members: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: TenantMemberRole;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          user_id: string;
          role: TenantMemberRole;
        };
        Update: {
          role?: TenantMemberRole;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          detail: Json;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          actor_id?: string | null;
          actor_role?: string | null;
          action: string;
          target_table?: string | null;
          target_id?: string | null;
          detail?: Json;
          ip?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          parent_id?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          parent_id?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          category_id: string | null;
          pricing_mode: ProductPricingMode;
          status: ProductStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          title: string;
          description?: string | null;
          category_id?: string | null;
          pricing_mode?: ProductPricingMode;
          status?: ProductStatus;
        };
        /**
         * 審査列（reviewed_by / reviewed_at / review_note）も書ける形にしてある。
         * 本部の審査（lib/products/review.ts）が本部のセッションで書くため。
         *
         * テナントからの変更を止めているのは型ではなく
         * 0010 の products_guard_review_columns()。呼び出し元が
         * 本部オペレーター以上かサーバー処理でなければ例外になる。
         * 型はどちらの経路も同じなので、ここでの制限は防御にならない。
         */
        Update: {
          title?: string;
          description?: string | null;
          category_id?: string | null;
          pricing_mode?: ProductPricingMode;
          status?: ProductStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          option_label: string | null;
          price_incl_tax: number;
          tax_rate: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          option_label?: string | null;
          price_incl_tax: number;
          tax_rate?: number;
          is_active?: boolean;
        };
        Update: {
          sku?: string;
          option_label?: string | null;
          price_incl_tax?: number;
          tax_rate?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          sort_order: number;
        };
        Insert: {
          product_id: string;
          storage_path: string;
          sort_order?: number;
        };
        Update: {
          storage_path?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      inventories: {
        Row: {
          variant_id: string;
          quantity: number;
          reserved_quantity: number;
        };
        Insert: {
          variant_id: string;
          quantity?: number;
        };
        /** 引当数は 0010 のトリガでサーバー処理だけに限っている */
        Update: {
          quantity?: number;
        };
        Relationships: [];
      };
      buyer_addresses: {
        Row: {
          id: string;
          buyer_id: string;
          recipient_name: string;
          phone: string;
          postal_code: string;
          prefecture_code: string;
          city: string;
          address_line1: string;
          address_line2: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          buyer_id: string;
          recipient_name: string;
          phone: string;
          postal_code: string;
          prefecture_code: string;
          city: string;
          address_line1: string;
          address_line2?: string | null;
          is_default?: boolean;
        };
        Update: {
          recipient_name?: string;
          phone?: string;
          postal_code?: string;
          prefecture_code?: string;
          city?: string;
          address_line1?: string;
          address_line2?: string | null;
          is_default?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_reservations: {
        Row: {
          id: string;
          variant_id: string;
          cart_id: string | null;
          order_id: string | null;
          quantity: number;
          expires_at: string;
          released_at: string | null;
          created_at: string;
        };
        // 書き込みは 0011 の関数（service_role）だけ。RLS 有効・ポリシー無し
        Insert: never;
        Update: never;
        Relationships: [];
      };
      carts: {
        Row: {
          id: string;
          buyer_id: string;
          tenant_id: string;
          created_at: string;
        };
        Insert: {
          buyer_id: string;
          tenant_id: string;
        };
        Update: never;
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          variant_id: string;
          quantity: number;
        };
        Insert: {
          cart_id: string;
          variant_id: string;
          quantity: number;
        };
        Update: {
          quantity?: number;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          buyer_id: string;
          tenant_id: string;
          status: OrderStatus;
          subtotal_incl_tax: number;
          shipping_fee: number;
          point_discount: number;
          total_charged: number;
          point_rule_snapshot: Json;
          shipping_address: Json;
          placed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /**
         * 作るのはサーバー処理だけ（0015 に insert のポリシーを置いていない）。
         * 金額を決めるのはサーバーであって購入者ではない。
         */
        Insert: {
          order_number: string;
          buyer_id: string;
          tenant_id: string;
          status?: OrderStatus;
          subtotal_incl_tax: number;
          shipping_fee?: number;
          point_discount?: number;
          total_charged: number;
          point_rule_snapshot?: Json;
          shipping_address: Json;
          placed_at?: string | null;
        };
        /**
         * 型では `status` 以外も書ける形にしてある。サーバー処理
         * （注文の作成・決済の確定）が同じ型を通るため。
         *
         * テナントを止めているのは型ではなく 0015 の
         * `orders_guard_columns()`。金額・配送先・ポイントルールの変更は
         * 例外になる（products の審査列と同じ関係）。
         */
        Update: {
          status?: OrderStatus;
          point_discount?: number;
          total_charged?: number;
          point_rule_snapshot?: Json;
          placed_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string;
          product_title: string;
          unit_price_incl_tax: number;
          quantity: number;
          line_total_incl_tax: number;
          point_eligible_amount: number;
          allocated_point_discount: number;
          refunded_quantity: number;
        };
        Insert: {
          order_id: string;
          variant_id: string;
          /** 注文時点の名称を写し取る。商品が改名されても変わらない */
          product_title: string;
          unit_price_incl_tax: number;
          quantity: number;
          line_total_incl_tax: number;
          point_eligible_amount: number;
          allocated_point_discount?: number;
        };
        /** 返品でしか動かない。数量と金額は注文時点のまま */
        Update: {
          refunded_quantity?: number;
          allocated_point_discount?: number;
        };
        Relationships: [];
      };
      shipments: {
        Row: {
          id: string;
          order_id: string;
          carrier: string | null;
          tracking_number: string | null;
          /** ポイント確定（発送登録日＋14日）の起点（docs/02 6.1） */
          shipped_at: string;
          created_at: string;
        };
        Insert: {
          order_id: string;
          carrier?: string | null;
          tracking_number?: string | null;
          shipped_at: string;
        };
        Update: {
          carrier?: string | null;
          tracking_number?: string | null;
        };
        Relationships: [];
      };
      shipping_profiles: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          base_fee: number;
          free_threshold: number | null;
          lead_time_days: number;
          region_rules: Json;
        };
        Insert: {
          tenant_id: string;
          name: string;
          base_fee?: number;
          free_threshold?: number | null;
          lead_time_days?: number;
          // 形は 0012 の検査制約（shipping_profiles_region_rules_shape）が守る。
          // 型では Json までしか言えない
          region_rules?: Json;
        };
        Update: {
          name?: string;
          base_fee?: number;
          free_threshold?: number | null;
          lead_time_days?: number;
          region_rules?: Json;
        };
        Relationships: [];
      };
      site_pages: {
        Row: {
          id: string;
          slug: string;
          title: string;
          sort_order: number;
          is_published: boolean;
          published_revision_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          title: string;
          sort_order?: number;
          is_published?: boolean;
          published_revision_id?: string | null;
        };
        Update: {
          slug?: string;
          title?: string;
          sort_order?: number;
          is_published?: boolean;
          published_revision_id?: string | null;
        };
        Relationships: [];
      };
      site_page_revisions: {
        Row: {
          id: string;
          page_id: string;
          revision_number: number;
          body: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          page_id: string;
          revision_number: number;
          body: string;
          note?: string | null;
          created_by?: string | null;
        };
        /**
         * 版は積むだけで書き換えない。規約の改定履歴は「いつ何を出していたか」を
         * 後から示せる必要があるため、既存の版を直せる型を持たせない。
         */
        Update: never;
        Relationships: [];
      };
      product_inquiries: {
        Row: {
          id: string;
          product_id: string;
          tenant_id: string;
          buyer_id: string;
          status: InquiryStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          tenant_id: string;
          buyer_id: string;
        };
        /**
         * 変えられるのは状態だけ。宛先・対象商品・購入者は 0014 の
         * `inquiries_guard_columns()` が拒否する。型でも同じ形にしてあるが、
         * 止めているのはトリガのほう（products の審査列と同じ関係）。
         */
        Update: {
          status?: InquiryStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_inquiry_messages: {
        Row: {
          id: string;
          inquiry_id: string;
          sender_role: InquirySenderRole;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          inquiry_id: string;
          sender_role: InquirySenderRole;
          sender_id: string;
          body: string;
        };
        /**
         * 追記専用。「何を答えたか」が争点になったときに記録の意味が
         * なくなるため、既存の発言を直せる型を持たせない。
         * 実際に止めているのは 0014 のトリガ。
         */
        Update: never;
        Relationships: [];
      };
      point_rules: {
        Row: {
          id: string;
          scope: PointRuleScope;
          target_id: string | null;
          /** numeric(5,4)。**文字列で返る。** `parseRatio()` で読むこと */
          rate: string;
          /** numeric(4,3)。同上 */
          usage_cap_ratio: string;
          confirm_after_days: number;
          expire_after_months: number;
          funding_source_id: string | null;
          effective_from: string;
          effective_to: string | null;
        };
        /**
         * **上書きせず版として積む**（docs/02 6.1）。変更は前の版を閉じて
         * から新しい版を足す。順序を逆にすると 0016 の部分一意索引
         * （`point_rules_one_open_base`）に弾かれる。
         */
        Insert: {
          scope: PointRuleScope;
          target_id?: string | null;
          rate: string | number;
          usage_cap_ratio: string | number;
          confirm_after_days: number;
          expire_after_months: number;
          funding_source_id?: string | null;
          effective_from?: string;
          effective_to?: string | null;
        };
        /** 閉じる以外に既存の版を触らない */
        Update: {
          effective_to?: string | null;
        };
        Relationships: [];
      };
      point_ledger_entries: {
        Row: {
          id: string;
          buyer_id: string;
          entry_type: PointEntryType;
          delta: number;
          lot_id: string | null;
          order_id: string | null;
          order_item_id: string | null;
          funding_source_id: string | null;
          reversal_of: string | null;
          reason: string;
          actor_id: string | null;
          idempotency_key: string;
          occurred_at: string;
        };
        Insert: {
          buyer_id: string;
          entry_type: PointEntryType;
          delta: number;
          lot_id?: string | null;
          order_id?: string | null;
          order_item_id?: string | null;
          funding_source_id?: string | null;
          reversal_of?: string | null;
          reason: string;
          actor_id?: string | null;
          /** `order_item_id + entry_type + sequence`。一意制約が重複を拒否 */
          idempotency_key: string;
        };
        /**
         * **追記専用**（CLAUDE.md 絶対ルール）。訂正・取消は反対取引の行を
         * 追加する。既存の行を直せる型を持たせない。
         */
        Update: never;
        Relationships: [];
      };
      point_lots: {
        Row: {
          id: string;
          buyer_id: string;
          order_id: string | null;
          order_item_id: string | null;
          funding_source_id: string | null;
          point_rule_id: string | null;
          status: PointLotStatus;
          granted_points: number;
          remaining_points: number;
          expires_at: string;
          confirmed_at: string | null;
          created_at: string;
        };
        Insert: {
          buyer_id: string;
          order_id?: string | null;
          order_item_id?: string | null;
          funding_source_id?: string | null;
          point_rule_id?: string | null;
          status?: PointLotStatus;
          granted_points: number;
          remaining_points: number;
          expires_at: string;
        };
        /** 残量と状態だけが動く。付与数と期限は付与時点のまま */
        Update: {
          status?: PointLotStatus;
          remaining_points?: number;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      point_accounts: {
        Row: { buyer_id: string; created_at: string };
        Insert: { buyer_id: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      /**
       * 台帳とロットからの算出残高（0005）。`security_invoker = on` なので
       * ビュー越しでも他人の残高は見えない。
       */
      point_balances: {
        Row: {
          buyer_id: string;
          available_points: number;
          pending_points: number;
          reserved_points: number;
          /** 予約中を除いた残高。**マイナスになりうる**（docs/02 6.4） */
          usable_points: number;
        };
        Relationships: [];
      };
      /**
       * 負担元・ルール種別ごとの未使用ポイント（0005）。本部の発行状況に使う。
       * `security_invoker = on` なので、読めるのは `point_lots_hq_read` を
       * 通せる本部オペレーター以上に限られる。
       */
      point_outstanding_liability: {
        Row: {
          funding_source_type: string;
          tenant_id: string | null;
          rule_scope: string;
          pending_points: number;
          available_points: number;
          /** 額面ベースの最大値引き原資（確定待ち＋利用可能） */
          max_discount_reserve: number;
        };
        Relationships: [];
      };
      /** 月次の発行・確定・利用・失効（0005）。`year_month` は月初の日付 */
      point_monthly_movements: {
        Row: {
          year_month: string;
          funding_source_type: string;
          rule_scope: string;
          issued_points: number;
          confirmed_points: number;
          used_points: number;
          refunded_points: number;
          expired_points: number;
          reversed_points: number;
          adjusted_points: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_hq_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      /**
       * 在庫引当（0011）。成功なら引当ID、在庫不足なら null。
       * 実行権限は service_role のみ。
       */
      reserve_inventory: {
        Args: {
          p_variant_id: string;
          p_quantity: number;
          p_cart_id?: string | null;
          p_order_id?: string | null;
        };
        Returns: string | null;
      };
      release_reservation: {
        Args: { p_reservation_id: string };
        Returns: boolean;
      };
      /**
       * 問い合わせのスレッドと 1 通目をまとめて作る（0014）。
       *
       * 購入者は `auth.uid()`、宛先は商品から決まる。引数に取らないのは、
       * `security definer` で RLS を通らないため、引数にすると他人の名前で
       * スレッドを立てられるから。
       */
      create_product_inquiry: {
        Args: { p_product_id: string; p_body: string };
        Returns: string;
      };
      /**
       * 発送登録（0015）。状態（paid→shipped）と shipments の記録を
       * まとめて書く。動かせなければ false。
       *
       * invoker なので RLS がそのまま効く（自店の注文だけ）。
       */
      ship_order: {
        Args: { p_order_id: string; p_carrier?: string | null; p_tracking?: string | null };
        Returns: boolean;
      };
      /** カートの引当を注文へ移す（0015）。付け替えた件数を返す */
      attach_reservations_to_order: {
        Args: { p_cart_id: string; p_order_id: string };
        Returns: number;
      };
      /** 注文の引当をまとめて解放する（0015）。二重に呼んでも戻し過ぎない */
      release_order_reservations: {
        Args: { p_order_id: string };
        Returns: number;
      };
      /** 有効な引当が残っていない決済待ちを取消にする（0015）。冪等 */
      expire_pending_orders: {
        Args: Record<string, never>;
        Returns: number;
      };
      /** 期限切れをまとめて解放し、件数を返す。冪等 */
      release_expired_reservations: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      hq_role: HqRole;
      tenant_status: TenantStatus;
      product_status: ProductStatus;
      product_pricing_mode: ProductPricingMode;
      inquiry_status: InquiryStatus;
      inquiry_sender_role: InquirySenderRole;
      order_status: OrderStatus;
      point_entry_type: PointEntryType;
      point_lot_status: PointLotStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
