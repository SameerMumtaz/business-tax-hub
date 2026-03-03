export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categorization_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          priority: number
          type: string
          user_id: string | null
          vendor_pattern: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          priority?: number
          type?: string
          user_id?: string | null
          vendor_pattern: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          priority?: number
          type?: string
          user_id?: string | null
          vendor_pattern?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contractors: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          pay_rate: number | null
          state_employed: string | null
          tin_last4: string | null
          total_paid: number
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          pay_rate?: number | null
          state_employed?: string | null
          tin_last4?: string | null
          total_paid?: number
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          pay_rate?: number | null
          state_employed?: string | null
          tin_last4?: string | null
          total_paid?: number
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          created_at: string
          federal_withholding: number
          id: string
          medicare: number
          name: string
          salary: number
          social_security: number
          ssn_last4: string | null
          start_date: string | null
          state_employed: string | null
          state_withholding: number
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          federal_withholding?: number
          id?: string
          medicare?: number
          name: string
          salary?: number
          social_security?: number
          ssn_last4?: string | null
          start_date?: string | null
          state_employed?: string | null
          state_withholding?: number
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          federal_withholding?: number
          id?: string
          medicare?: number
          name?: string
          salary?: number
          social_security?: number
          ssn_last4?: string | null
          start_date?: string | null
          state_employed?: string | null
          state_withholding?: number
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string | null
          id: string
          user_id: string
          vendor: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          user_id: string
          vendor: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          user_id?: string
          vendor?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description?: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_email: string | null
          client_id: string | null
          client_name: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          is_recurring: boolean
          issue_date: string
          matched_sale_id: string | null
          notes: string | null
          recurring_end_date: string | null
          recurring_interval: string | null
          recurring_next_date: string | null
          recurring_parent_id: string | null
          share_token: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_email?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          is_recurring?: boolean
          issue_date: string
          matched_sale_id?: string | null
          notes?: string | null
          recurring_end_date?: string | null
          recurring_interval?: string | null
          recurring_next_date?: string | null
          recurring_parent_id?: string | null
          share_token?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          is_recurring?: boolean
          issue_date?: string
          matched_sale_id?: string | null
          notes?: string | null
          recurring_end_date?: string | null
          recurring_interval?: string | null
          recurring_next_date?: string | null
          recurring_parent_id?: string | null
          share_token?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_matched_sale_id_fkey"
            columns: ["matched_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recurring_parent_id_fkey"
            columns: ["recurring_parent_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_address: string | null
          business_city: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          business_state: string | null
          business_type: string | null
          business_zip: string | null
          created_at: string
          ein_last4: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_address?: string | null
          business_city?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_type?: string | null
          business_zip?: string | null
          created_at?: string
          ein_last4?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_address?: string | null
          business_city?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_type?: string | null
          business_zip?: string | null
          created_at?: string
          ein_last4?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount: number
          client: string
          created_at: string
          date: string
          description: string | null
          id: string
          invoice_number: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          client: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          client?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
