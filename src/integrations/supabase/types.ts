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
      audit_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          issue_type: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          issue_type: string
          transaction_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          issue_type?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_pages: {
        Row: {
          active: boolean
          available_days: number[]
          available_hours_end: string
          available_hours_start: string
          buffer_minutes: number
          business_name: string
          created_at: string
          id: string
          services: Json
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          available_days?: number[]
          available_hours_end?: string
          available_hours_start?: string
          buffer_minutes?: number
          business_name?: string
          created_at?: string
          id?: string
          services?: Json
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          available_days?: number[]
          available_hours_end?: string
          available_hours_start?: string
          buffer_minutes?: number
          business_name?: string
          created_at?: string
          id?: string
          services?: Json
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          booking_page_id: string
          client_email: string
          client_name: string
          client_phone: string | null
          created_at: string
          duration_minutes: number
          id: string
          notes: string | null
          price: number
          requested_date: string
          requested_time: string
          service_name: string
          status: string
        }
        Insert: {
          booking_page_id: string
          client_email: string
          client_name: string
          client_phone?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          price?: number
          requested_date: string
          requested_time: string
          service_name: string
          status?: string
        }
        Update: {
          booking_page_id?: string
          client_email?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          price?: number
          requested_date?: string
          requested_time?: string
          service_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          priority: number
          type: string
          user_id: string
          vendor_pattern: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          priority?: number
          type?: string
          user_id: string
          vendor_pattern: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          priority?: number
          type?: string
          user_id?: string
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
      crew_checkins: {
        Row: {
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_time: string
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_time: string | null
          created_at: string
          expected_hours: number | null
          flag_reason: string | null
          id: string
          job_id: string | null
          job_site_id: string | null
          notes: string | null
          status: string
          team_member_id: string
          total_hours: number | null
        }
        Insert: {
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_time?: string
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_time?: string | null
          created_at?: string
          expected_hours?: number | null
          flag_reason?: string | null
          id?: string
          job_id?: string | null
          job_site_id?: string | null
          notes?: string | null
          status?: string
          team_member_id: string
          total_hours?: number | null
        }
        Update: {
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_time?: string
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_time?: string | null
          created_at?: string
          expected_hours?: number | null
          flag_reason?: string | null
          id?: string
          job_id?: string | null
          job_site_id?: string | null
          notes?: string | null
          status?: string
          team_member_id?: string
          total_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_checkins_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_checkins_job_site_id_fkey"
            columns: ["job_site_id"]
            isOneToOne: false
            referencedRelation: "job_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_checkins_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
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
          receipt_url: string | null
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
          receipt_url?: string | null
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
          receipt_url?: string | null
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
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          date_paid: string
          id: string
          invoice_id: string
          method: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date_paid: string
          id?: string
          invoice_id: string
          method?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date_paid?: string
          id?: string
          invoice_id?: string
          method?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
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
          job_id: string | null
          matched_sale_id: string | null
          notes: string | null
          pay_status: string
          recurring_end_date: string | null
          recurring_interval: string | null
          recurring_next_date: string | null
          recurring_parent_id: string | null
          share_token: string | null
          status: string
          stripe_payment_intent_id: string | null
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
          job_id?: string | null
          matched_sale_id?: string | null
          notes?: string | null
          pay_status?: string
          recurring_end_date?: string | null
          recurring_interval?: string | null
          recurring_next_date?: string | null
          recurring_parent_id?: string | null
          share_token?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
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
          job_id?: string | null
          matched_sale_id?: string | null
          notes?: string | null
          pay_status?: string
          recurring_end_date?: string | null
          recurring_interval?: string | null
          recurring_next_date?: string | null
          recurring_parent_id?: string | null
          share_token?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
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
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      job_assignments: {
        Row: {
          assigned_hours: number
          created_at: string
          id: string
          job_id: string
          worker_id: string
          worker_name: string
          worker_type: string
        }
        Insert: {
          assigned_hours?: number
          created_at?: string
          id?: string
          job_id: string
          worker_id: string
          worker_name: string
          worker_type: string
        }
        Update: {
          assigned_hours?: number
          created_at?: string
          id?: string
          job_id?: string
          worker_id?: string
          worker_name?: string
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_expenses: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          job_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          job_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          caption: string | null
          id: string
          job_id: string
          photo_type: string
          photo_url: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          id?: string
          job_id: string
          photo_type?: string
          photo_url: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          id?: string
          job_id?: string
          photo_type?: string
          photo_url?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sites: {
        Row: {
          address: string | null
          city: string | null
          client_id: string | null
          created_at: string
          geofence_radius: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          state: string | null
          user_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          state?: string | null
          user_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          state?: string | null
          user_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          invoice_id: string | null
          job_type: string
          labor_budget_amount: number
          labor_budget_hours: number
          labor_budget_rate: number
          labor_budget_type: string
          material_budget: number
          price: number
          recurring_end_date: string | null
          recurring_interval: string | null
          site_id: string
          start_date: string
          start_time: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          invoice_id?: string | null
          job_type?: string
          labor_budget_amount?: number
          labor_budget_hours?: number
          labor_budget_rate?: number
          labor_budget_type?: string
          material_budget?: number
          price?: number
          recurring_end_date?: string | null
          recurring_interval?: string | null
          site_id: string
          start_date: string
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          invoice_id?: string | null
          job_type?: string
          labor_budget_amount?: number
          labor_budget_hours?: number
          labor_budget_rate?: number
          labor_budget_type?: string
          material_budget?: number
          price?: number
          recurring_end_date?: string | null
          recurring_interval?: string | null
          site_id?: string
          start_date?: string
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "job_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_rate_changes: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          new_rate: number
          previous_rate: number
          reason: string | null
          team_member_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: string
          new_rate?: number
          previous_rate?: number
          reason?: string | null
          team_member_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          new_rate?: number
          previous_rate?: number
          reason?: string | null
          team_member_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_rate_changes_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_deductions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          tax_year: number
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          tax_year?: number
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          tax_year?: number
          user_id?: string
        }
        Relationships: []
      }
      personal_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string | null
          id: string
          receipt_url: string | null
          tax_deductible: boolean
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
          receipt_url?: string | null
          tax_deductible?: boolean
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
          receipt_url?: string | null
          tax_deductible?: boolean
          user_id?: string
          vendor?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string | null
          bookie_id: string | null
          business_address: string | null
          business_city: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          business_state: string | null
          business_type: string | null
          business_zip: string | null
          created_at: string
          default_tax_rate: number
          ein_last4: string | null
          filing_status: string | null
          first_name: string | null
          id: string
          last_name: string | null
          personal_address: string | null
          personal_city: string | null
          personal_state: string | null
          personal_zip: string | null
          ssn_last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string | null
          bookie_id?: string | null
          business_address?: string | null
          business_city?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_type?: string | null
          business_zip?: string | null
          created_at?: string
          default_tax_rate?: number
          ein_last4?: string | null
          filing_status?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          personal_address?: string | null
          personal_city?: string | null
          personal_state?: string | null
          personal_zip?: string | null
          ssn_last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string | null
          bookie_id?: string | null
          business_address?: string | null
          business_city?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_type?: string | null
          business_zip?: string | null
          created_at?: string
          default_tax_rate?: number
          ein_last4?: string | null
          filing_status?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          personal_address?: string | null
          personal_city?: string | null
          personal_state?: string | null
          personal_zip?: string | null
          ssn_last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quarterly_tax_payments: {
        Row: {
          amount_paid: number
          created_at: string
          date_paid: string
          id: string
          notes: string | null
          payment_type: string
          quarter: number
          tax_year: number
          user_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          date_paid: string
          id?: string
          notes?: string | null
          payment_type?: string
          quarter: number
          tax_year?: number
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          date_paid?: string
          id?: string
          notes?: string | null
          payment_type?: string
          quarter?: number
          tax_year?: number
          user_id?: string
        }
        Relationships: []
      }
      quote_line_items: {
        Row: {
          amount: number
          description: string
          id: string
          quantity: number
          quote_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description?: string
          id?: string
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_email: string | null
          client_id: string | null
          client_name: string
          converted_invoice_id: string | null
          converted_job_id: string | null
          created_at: string
          id: string
          notes: string | null
          quote_number: string
          share_token: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          title: string
          total: number
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          converted_invoice_id?: string | null
          converted_job_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_number: string
          share_token?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string
          total?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          converted_invoice_id?: string | null
          converted_job_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_number?: string
          share_token?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string
          total?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_periods: {
        Row: {
          account_name: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          reconciled_at: string | null
          statement_balance: number
          status: string
          user_id: string
        }
        Insert: {
          account_name: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          reconciled_at?: string | null
          statement_balance?: number
          status?: string
          user_id: string
        }
        Update: {
          account_name?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          reconciled_at?: string | null
          statement_balance?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount: number
          category: string
          client: string
          created_at: string
          date: string
          description: string | null
          id: string
          invoice_number: string | null
          tax_collected: number
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          client: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          tax_collected?: number
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          client?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          tax_collected?: number
          user_id?: string
        }
        Relationships: []
      }
      sales_tax_filings: {
        Row: {
          created_at: string
          filed_at: string | null
          id: string
          period_end: string
          period_label: string
          period_start: string
          tax_collected: number
          user_id: string
        }
        Insert: {
          created_at?: string
          filed_at?: string | null
          id?: string
          period_end: string
          period_label: string
          period_start: string
          tax_collected?: number
          user_id: string
        }
        Update: {
          created_at?: string
          filed_at?: string | null
          id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          tax_collected?: number
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          business_user_id: string
          created_at: string
          email: string
          id: string
          invited_at: string
          member_user_id: string | null
          name: string
          pay_rate: number | null
          role: Database["public"]["Enums"]["team_role"]
          status: string
          worker_type: string
        }
        Insert: {
          accepted_at?: string | null
          business_user_id: string
          created_at?: string
          email: string
          id?: string
          invited_at?: string
          member_user_id?: string | null
          name: string
          pay_rate?: number | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          worker_type?: string
        }
        Update: {
          accepted_at?: string | null
          business_user_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_at?: string
          member_user_id?: string | null
          name?: string
          pay_rate?: number | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          worker_type?: string
        }
        Relationships: []
      }
      timesheet_entries: {
        Row: {
          created_at: string
          fri_hours: number
          id: string
          job_id: string | null
          mon_hours: number
          overtime_hours: number
          overtime_pay: number
          pay_rate: number
          regular_pay: number
          sat_hours: number
          sun_hours: number
          thu_hours: number
          timesheet_id: string
          total_hours: number
          total_pay: number
          tue_hours: number
          wed_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }
        Insert: {
          created_at?: string
          fri_hours?: number
          id?: string
          job_id?: string | null
          mon_hours?: number
          overtime_hours?: number
          overtime_pay?: number
          pay_rate?: number
          regular_pay?: number
          sat_hours?: number
          sun_hours?: number
          thu_hours?: number
          timesheet_id: string
          total_hours?: number
          total_pay?: number
          tue_hours?: number
          wed_hours?: number
          worker_id: string
          worker_name: string
          worker_type: string
        }
        Update: {
          created_at?: string
          fri_hours?: number
          id?: string
          job_id?: string | null
          mon_hours?: number
          overtime_hours?: number
          overtime_pay?: number
          pay_rate?: number
          regular_pay?: number
          sat_hours?: number
          sun_hours?: number
          thu_hours?: number
          timesheet_id?: string
          total_hours?: number
          total_pay?: number
          tue_hours?: number
          wed_hours?: number
          worker_id?: string
          worker_name?: string
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      vehicle_expenses: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_payments: {
        Row: {
          amount_paid: number
          created_at: string
          date_paid: string
          id: string
          interest_portion: number
          notes: string | null
          payment_number: number
          principal_portion: number
          user_id: string
          vehicle_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          date_paid: string
          id?: string
          interest_portion?: number
          notes?: string | null
          payment_number?: number
          principal_portion?: number
          user_id: string
          vehicle_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          date_paid?: string
          id?: string
          interest_portion?: number
          notes?: string | null
          payment_number?: number
          principal_portion?: number
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_payments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          business_use_pct: number
          created_at: string
          depreciation_method: string
          id: string
          interest_rate: number
          loan_amount: number
          loan_start_date: string | null
          loan_term_months: number
          make: string | null
          model: string | null
          monthly_payment: number
          name: string
          notes: string | null
          placed_in_service_date: string | null
          purchase_price: number
          section_179_amount: number
          status: string
          useful_life_years: number
          user_id: string
          vin_last6: string | null
          year: number | null
        }
        Insert: {
          business_use_pct?: number
          created_at?: string
          depreciation_method?: string
          id?: string
          interest_rate?: number
          loan_amount?: number
          loan_start_date?: string | null
          loan_term_months?: number
          make?: string | null
          model?: string | null
          monthly_payment?: number
          name: string
          notes?: string | null
          placed_in_service_date?: string | null
          purchase_price?: number
          section_179_amount?: number
          status?: string
          useful_life_years?: number
          user_id: string
          vin_last6?: string | null
          year?: number | null
        }
        Update: {
          business_use_pct?: number
          created_at?: string
          depreciation_method?: string
          id?: string
          interest_rate?: number
          loan_amount?: number
          loan_start_date?: string | null
          loan_term_months?: number
          make?: string | null
          model?: string | null
          monthly_payment?: number
          name?: string
          notes?: string | null
          placed_in_service_date?: string | null
          purchase_price?: number
          section_179_amount?: number
          status?: string
          useful_life_years?: number
          user_id?: string
          vin_last6?: string | null
          year?: number | null
        }
        Relationships: []
      }
      w2_income: {
        Row: {
          created_at: string
          employer_ein: string | null
          employer_name: string
          federal_tax_withheld: number
          id: string
          medicare_withheld: number
          notes: string | null
          social_security_withheld: number
          state: string | null
          state_tax_withheld: number
          tax_year: number
          user_id: string
          wages: number
        }
        Insert: {
          created_at?: string
          employer_ein?: string | null
          employer_name: string
          federal_tax_withheld?: number
          id?: string
          medicare_withheld?: number
          notes?: string | null
          social_security_withheld?: number
          state?: string | null
          state_tax_withheld?: number
          tax_year?: number
          user_id: string
          wages?: number
        }
        Update: {
          created_at?: string
          employer_ein?: string | null
          employer_name?: string
          federal_tax_withheld?: number
          id?: string
          medicare_withheld?: number
          notes?: string | null
          social_security_withheld?: number
          state?: string | null
          state_tax_withheld?: number
          tax_year?: number
          user_id?: string
          wages?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_business_ids_for_member: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_business_job_ids: { Args: { _user_id: string }; Returns: string[] }
      get_business_timesheet_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_team_role: {
        Args: { _business_id: string; _user_id: string }
        Returns: string
      }
      is_team_member_of: {
        Args: { _business_user_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      team_role: "admin" | "manager" | "crew"
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
    Enums: {
      team_role: ["admin", "manager", "crew"],
    },
  },
} as const
