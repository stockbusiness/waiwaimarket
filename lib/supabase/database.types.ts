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
    };
    Views: Record<never, never>;
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
      order_status: OrderStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
