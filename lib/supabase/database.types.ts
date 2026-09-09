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
    };
    Views: Record<never, never>;
    Functions: {
      current_hq_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: {
      hq_role: HqRole;
      tenant_status: TenantStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
