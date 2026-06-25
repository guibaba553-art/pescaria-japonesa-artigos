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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          accessed_user_id: string | null
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          accessed_user_id?: string | null
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          accessed_user_id?: string | null
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          cash_register_id: string
          created_at: string
          id: string
          performed_by: string
          reason: string | null
          type: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          created_at?: string
          id?: string
          performed_by: string
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          created_at?: string
          id?: string
          performed_by?: string
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          additions: number
          card_sales: number
          cash_sales: number
          closed_at: string | null
          closing_amount: number | null
          created_at: string
          expected_amount: number
          id: string
          opened_at: string
          opened_by: string
          opening_amount: number
          pix_sales: number
          status: string
          updated_at: string
          withdrawals: number
        }
        Insert: {
          additions?: number
          card_sales?: number
          cash_sales?: number
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          expected_amount?: number
          id?: string
          opened_at?: string
          opened_by: string
          opening_amount?: number
          pix_sales?: number
          status?: string
          updated_at?: string
          withdrawals?: number
        }
        Update: {
          additions?: number
          card_sales?: number
          cash_sales?: number
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          expected_amount?: number
          id?: string
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          pix_sales?: number
          status?: string
          updated_at?: string
          withdrawals?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_primary: boolean
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_primary?: boolean
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_fiscal_defaults: {
        Row: {
          category: string
          cest: string | null
          cfop: string | null
          created_at: string
          csosn: string | null
          id: string
          ncm: string | null
          origem: string | null
          unidade_comercial: string | null
          updated_at: string
        }
        Insert: {
          category: string
          cest?: string | null
          cfop?: string | null
          created_at?: string
          csosn?: string | null
          id?: string
          ncm?: string | null
          origem?: string | null
          unidade_comercial?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          cest?: string | null
          cfop?: string | null
          created_at?: string
          csosn?: string | null
          id?: string
          ncm?: string | null
          origem?: string | null
          unidade_comercial?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          is_from_user: boolean
          message: string
          product_id: string | null
          read_by_user: boolean
          replied: boolean
          replied_at: string | null
          replied_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_from_user?: boolean
          message: string
          product_id?: string | null
          read_by_user?: boolean
          replied?: boolean
          replied_at?: string | null
          replied_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_from_user?: boolean
          message?: string
          product_id?: string | null
          read_by_user?: boolean
          replied?: boolean
          replied_at?: string | null
          replied_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fiscal_data: {
        Row: {
          bairro: string
          cep: string
          cnae_principal: string | null
          cnpj: string
          codigo_municipio: string | null
          complemento: string | null
          contador_bairro: string | null
          contador_cep: string | null
          contador_cnpj: string | null
          contador_codigo_municipio: string | null
          contador_complemento: string | null
          contador_cpf: string | null
          contador_crc: string | null
          contador_email: string | null
          contador_fax: string | null
          contador_logradouro: string | null
          contador_nome: string | null
          contador_numero: string | null
          contador_telefone: string | null
          created_at: string
          email: string | null
          id: string
          ind_ativ: string
          ind_perfil: string
          inscricao_estadual: string
          inscricao_municipal: string | null
          logradouro: string
          municipio: string
          nome_fantasia: string | null
          numero: string
          razao_social: string
          regime_tributario: string
          telefone: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          bairro: string
          cep: string
          cnae_principal?: string | null
          cnpj: string
          codigo_municipio?: string | null
          complemento?: string | null
          contador_bairro?: string | null
          contador_cep?: string | null
          contador_cnpj?: string | null
          contador_codigo_municipio?: string | null
          contador_complemento?: string | null
          contador_cpf?: string | null
          contador_crc?: string | null
          contador_email?: string | null
          contador_fax?: string | null
          contador_logradouro?: string | null
          contador_nome?: string | null
          contador_numero?: string | null
          contador_telefone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ind_ativ?: string
          ind_perfil?: string
          inscricao_estadual: string
          inscricao_municipal?: string | null
          logradouro: string
          municipio: string
          nome_fantasia?: string | null
          numero: string
          razao_social: string
          regime_tributario?: string
          telefone?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          bairro?: string
          cep?: string
          cnae_principal?: string | null
          cnpj?: string
          codigo_municipio?: string | null
          complemento?: string | null
          contador_bairro?: string | null
          contador_cep?: string | null
          contador_cnpj?: string | null
          contador_codigo_municipio?: string | null
          contador_complemento?: string | null
          contador_cpf?: string | null
          contador_crc?: string | null
          contador_email?: string | null
          contador_fax?: string | null
          contador_logradouro?: string | null
          contador_nome?: string | null
          contador_numero?: string | null
          contador_telefone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ind_ativ?: string
          ind_perfil?: string
          inscricao_estadual?: string
          inscricao_municipal?: string | null
          logradouro?: string
          municipio?: string
          nome_fantasia?: string | null
          numero?: string
          razao_social?: string
          regime_tributario?: string
          telefone?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_groups: {
        Row: {
          cost: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_amount: number
          id: string
          order_id: string | null
          redeemed_at: string
          source: string
          user_id: string | null
        }
        Insert: {
          coupon_id: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          redeemed_at?: string
          source?: string
          user_id?: string | null
        }
        Update: {
          coupon_id?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          redeemed_at?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_purchase: number
          scope: Database["public"]["Enums"]["coupon_scope"]
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_count: number
          usage_limit: number | null
          usage_limit_per_user: number | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_purchase?: number
          scope?: Database["public"]["Enums"]["coupon_scope"]
          starts_at?: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          usage_limit_per_user?: number | null
          value?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_purchase?: number
          scope?: Database["public"]["Enums"]["coupon_scope"]
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          usage_limit_per_user?: number | null
          value?: number
        }
        Relationships: []
      }
      customer_rewards: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          effect: Database["public"]["Enums"]["reward_effect"]
          ends_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["reward_kind"]
          scope: Database["public"]["Enums"]["reward_scope"]
          starts_at: string | null
          tier_id: string | null
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          effect?: Database["public"]["Enums"]["reward_effect"]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["reward_kind"]
          scope: Database["public"]["Enums"]["reward_scope"]
          starts_at?: string | null
          tier_id?: string | null
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          effect?: Database["public"]["Enums"]["reward_effect"]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["reward_kind"]
          scope?: Database["public"]["Enums"]["reward_scope"]
          starts_at?: string | null
          tier_id?: string | null
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: []
      }
      customer_score_events: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          performed_by: string | null
          points_delta: number
          reason: string
          source: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          performed_by?: string | null
          points_delta: number
          reason: string
          source?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          performed_by?: string | null
          points_delta?: number
          reason?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_score_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_score_reason_presets: {
        Row: {
          created_at: string
          created_by: string | null
          emoji: string | null
          id: string
          is_active: boolean
          label: string
          points: number
          reason: string
          sign: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          label: string
          points?: number
          reason: string
          sign?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          label?: string
          points?: number
          reason?: string
          sign?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_tiers: {
        Row: {
          allow_discount: boolean
          block_purchase: boolean
          color: string
          created_at: string
          discount_percent: number
          id: string
          max_score: number | null
          min_score: number
          name: string
          perks: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_discount?: boolean
          block_purchase?: boolean
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          max_score?: number | null
          min_score: number
          name: string
          perks?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_discount?: boolean
          block_purchase?: boolean
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          max_score?: number | null
          min_score?: number
          name?: string
          perks?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          cep: string
          cnpj: string | null
          codigo_municipio_ibge: string | null
          company_name: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          ie_indicador: string | null
          inscricao_estadual: string | null
          municipio: string | null
          neighborhood: string
          number: string
          phone: string | null
          preferred_emission_type: string | null
          score: number
          street: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          cep: string
          cnpj?: string | null
          codigo_municipio_ibge?: string | null
          company_name?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          ie_indicador?: string | null
          inscricao_estadual?: string | null
          municipio?: string | null
          neighborhood: string
          number: string
          phone?: string | null
          preferred_emission_type?: string | null
          score?: number
          street: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string
          cnpj?: string | null
          codigo_municipio_ibge?: string | null
          company_name?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          ie_indicador?: string | null
          inscricao_estadual?: string | null
          municipio?: string | null
          neighborhood?: string
          number?: string
          phone?: string | null
          preferred_emission_type?: string | null
          score?: number
          street?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dismissed_stock_alerts: {
        Row: {
          created_at: string
          dismissed_by: string | null
          id: string
          product_id: string
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          product_id: string
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          product_id?: string
          variation_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_permissions: {
        Row: {
          can_access_cash_register: boolean
          can_access_catalog: boolean
          can_access_dashboard: boolean
          can_access_fiscal: boolean
          can_access_orders: boolean
          can_access_pdv: boolean
          can_access_sales_analysis: boolean
          can_access_triagem: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_access_cash_register?: boolean
          can_access_catalog?: boolean
          can_access_dashboard?: boolean
          can_access_fiscal?: boolean
          can_access_orders?: boolean
          can_access_pdv?: boolean
          can_access_sales_analysis?: boolean
          can_access_triagem?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_access_cash_register?: boolean
          can_access_catalog?: boolean
          can_access_dashboard?: boolean
          can_access_fiscal?: boolean
          can_access_orders?: boolean
          can_access_pdv?: boolean
          can_access_sales_analysis?: boolean
          can_access_triagem?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          severity: string
          source: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          severity?: string
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          severity?: string
          source?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      expense_overrides: {
        Row: {
          amount: number | null
          created_at: string
          expense_id: string
          id: string
          notes: string | null
          skipped: boolean
          updated_at: string
          year_month: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          expense_id: string
          id?: string
          notes?: string | null
          skipped?: boolean
          updated_at?: string
          year_month: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          expense_id?: string
          id?: string
          notes?: string | null
          skipped?: boolean
          updated_at?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_overrides_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          expense_date: string
          id: string
          notes: string | null
          payment_method: string | null
          supplier: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          end_date?: string | null
          expense_date: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          supplier?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          end_date?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          supplier?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_rate_limits: {
        Row: {
          function_name: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          function_name: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          function_name?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      fiscal_settings: {
        Row: {
          auto_emit_nfe: boolean
          auto_sync_tga: boolean
          created_at: string
          id: string
          nfe_company_id: string | null
          nfe_enabled: boolean
          tga_api_url: string | null
          tga_enabled: boolean
          updated_at: string
        }
        Insert: {
          auto_emit_nfe?: boolean
          auto_sync_tga?: boolean
          created_at?: string
          id?: string
          nfe_company_id?: string | null
          nfe_enabled?: boolean
          tga_api_url?: string | null
          tga_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auto_emit_nfe?: boolean
          auto_sync_tga?: boolean
          created_at?: string
          id?: string
          nfe_company_id?: string | null
          nfe_enabled?: boolean
          tga_api_url?: string | null
          tga_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      focus_nfe_settings: {
        Row: {
          ambiente: string
          auto_emit_nfce_pdv: boolean
          auto_emit_nfe_pedido_pago: boolean
          cfop_interestadual: string
          cfop_padrao: string
          created_at: string
          csc_id: string | null
          csc_token: string | null
          csosn_padrao: string
          enabled: boolean
          id: string
          ncm_padrao: string | null
          origem_padrao: string
          proximo_numero_nfce: number
          proximo_numero_nfe: number
          serie_nfce: number
          serie_nfe: number
          unidade_padrao: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          auto_emit_nfce_pdv?: boolean
          auto_emit_nfe_pedido_pago?: boolean
          cfop_interestadual?: string
          cfop_padrao?: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          csosn_padrao?: string
          enabled?: boolean
          id?: string
          ncm_padrao?: string | null
          origem_padrao?: string
          proximo_numero_nfce?: number
          proximo_numero_nfe?: number
          serie_nfce?: number
          serie_nfe?: number
          unidade_padrao?: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          auto_emit_nfce_pdv?: boolean
          auto_emit_nfe_pedido_pago?: boolean
          cfop_interestadual?: string
          cfop_padrao?: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          csosn_padrao?: string
          enabled?: boolean
          id?: string
          ncm_padrao?: string | null
          origem_padrao?: string
          proximo_numero_nfce?: number
          proximo_numero_nfe?: number
          serie_nfce?: number
          serie_nfe?: number
          unidade_padrao?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfe_emissions: {
        Row: {
          ambiente: string
          cancelled_at: string | null
          created_at: string
          danfe_url: string | null
          emitted_at: string | null
          error_message: string | null
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          modelo: string
          motivo_cancelamento: string | null
          nfe_key: string | null
          nfe_number: string | null
          nfe_xml_url: string | null
          order_id: string
          products_count: number | null
          protocolo: string | null
          ref_focus: string | null
          status: string
          tipo: string
          updated_at: string
          valor_total: number | null
        }
        Insert: {
          ambiente?: string
          cancelled_at?: string | null
          created_at?: string
          danfe_url?: string | null
          emitted_at?: string | null
          error_message?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          modelo?: string
          motivo_cancelamento?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_xml_url?: string | null
          order_id: string
          products_count?: number | null
          protocolo?: string | null
          ref_focus?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number | null
        }
        Update: {
          ambiente?: string
          cancelled_at?: string | null
          created_at?: string
          danfe_url?: string | null
          emitted_at?: string | null
          error_message?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          modelo?: string
          motivo_cancelamento?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_xml_url?: string | null
          order_id?: string
          products_count?: number | null
          protocolo?: string | null
          ref_focus?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfe_emissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_entrada_pendentes: {
        Row: {
          chave_nfe: string
          created_at: string
          data_emissao: string | null
          error_message: string | null
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          manifestacao_at: string | null
          manifestacao_status: string | null
          numero_nfe: string | null
          parsed_data: Json | null
          processed_at: string | null
          processed_by: string | null
          serie: string | null
          status: string
          updated_at: string
          valor_total: number | null
          xml_content: string
        }
        Insert: {
          chave_nfe: string
          created_at?: string
          data_emissao?: string | null
          error_message?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          manifestacao_at?: string | null
          manifestacao_status?: string | null
          numero_nfe?: string | null
          parsed_data?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
          xml_content: string
        }
        Update: {
          chave_nfe?: string
          created_at?: string
          data_emissao?: string | null
          error_message?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          manifestacao_at?: string | null
          manifestacao_status?: string | null
          numero_nfe?: string | null
          parsed_data?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
          xml_content?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_at_purchase: number
          product_id: string
          quantity: number
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price_at_purchase: number
          product_id: string
          quantity: number
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_at_purchase?: number
          product_id?: string
          quantity?: number
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          authorization_code: string | null
          card_brand: string | null
          card_last_digits: string | null
          cash_received: number | null
          created_at: string
          customer_id: string | null
          delivery_type: string
          id: string
          idempotency_key: string | null
          installments: number
          notes: string | null
          nsu: string | null
          payment_id: string | null
          payment_method: string | null
          pdv_service_time_seconds: number | null
          pix_expiration: string | null
          qr_code: string | null
          qr_code_base64: string | null
          return_is_defect: boolean
          shipping_address: string
          shipping_cep: string
          shipping_city: string | null
          shipping_complement: string | null
          shipping_cost: number
          shipping_ibge: string | null
          shipping_label_order_id: string | null
          shipping_label_url: string | null
          shipping_neighborhood: string | null
          shipping_number: string | null
          shipping_recipient_name: string | null
          shipping_recipient_phone: string | null
          shipping_service_id: number | null
          shipping_street: string | null
          shipping_uf: string | null
          source: string
          status: Database["public"]["Enums"]["order_status"]
          tef_transaction_id: string | null
          ticket_url: string | null
          total_amount: number
          tracking_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          authorization_code?: string | null
          card_brand?: string | null
          card_last_digits?: string | null
          cash_received?: number | null
          created_at?: string
          customer_id?: string | null
          delivery_type?: string
          id?: string
          idempotency_key?: string | null
          installments?: number
          notes?: string | null
          nsu?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pdv_service_time_seconds?: number | null
          pix_expiration?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          return_is_defect?: boolean
          shipping_address: string
          shipping_cep: string
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_cost?: number
          shipping_ibge?: string | null
          shipping_label_order_id?: string | null
          shipping_label_url?: string | null
          shipping_neighborhood?: string | null
          shipping_number?: string | null
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
          shipping_service_id?: number | null
          shipping_street?: string | null
          shipping_uf?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          tef_transaction_id?: string | null
          ticket_url?: string | null
          total_amount: number
          tracking_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          authorization_code?: string | null
          card_brand?: string | null
          card_last_digits?: string | null
          cash_received?: number | null
          created_at?: string
          customer_id?: string | null
          delivery_type?: string
          id?: string
          idempotency_key?: string | null
          installments?: number
          notes?: string | null
          nsu?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pdv_service_time_seconds?: number | null
          pix_expiration?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          return_is_defect?: boolean
          shipping_address?: string
          shipping_cep?: string
          shipping_city?: string | null
          shipping_complement?: string | null
          shipping_cost?: number
          shipping_ibge?: string | null
          shipping_label_order_id?: string | null
          shipping_label_url?: string | null
          shipping_neighborhood?: string | null
          shipping_number?: string | null
          shipping_recipient_name?: string | null
          shipping_recipient_phone?: string | null
          shipping_service_id?: number | null
          shipping_street?: string | null
          shipping_uf?: string | null
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          tef_transaction_id?: string | null
          ticket_url?: string | null
          total_amount?: number
          tracking_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tef_transaction_id_fkey"
            columns: ["tef_transaction_id"]
            isOneToOne: false
            referencedRelation: "tef_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_rate_limits: {
        Row: {
          created_at: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      payment_refunds: {
        Row: {
          amount: number
          created_at: string
          error_message: string | null
          id: string
          mp_refund_id: string | null
          order_id: string
          payment_id: string
          performed_by: string | null
          reason: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          error_message?: string | null
          id?: string
          mp_refund_id?: string | null
          order_id: string
          payment_id: string
          performed_by?: string | null
          reason?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          error_message?: string | null
          id?: string
          mp_refund_id?: string | null
          order_id?: string
          payment_id?: string
          performed_by?: string | null
          reason?: string | null
          status?: string
        }
        Relationships: []
      }
      product_label_pending: {
        Row: {
          created_at: string
          id: string
          pending_qty: number
          product_id: string
          updated_at: string
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pending_qty?: number
          product_id: string
          updated_at?: string
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pending_qty?: number
          product_id?: string
          updated_at?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_label_pending_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_label_pending_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variations: {
        Row: {
          cost: number | null
          cost_group_id: string | null
          created_at: string
          description: string | null
          freight_pct: number
          height_cm: number | null
          id: string
          image_url: string | null
          length_cm: number | null
          min_sale_price: number | null
          min_stock: number
          name: string
          on_sale: boolean
          op_cost_pct: number
          price: number
          price_pdv: number | null
          product_id: string
          sale_ends_at: string | null
          sale_limit_qty: number | null
          sale_price: number | null
          sale_sold_qty: number
          sku: string | null
          stock: number
          tax_pct: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          cost?: number | null
          cost_group_id?: string | null
          created_at?: string
          description?: string | null
          freight_pct?: number
          height_cm?: number | null
          id?: string
          image_url?: string | null
          length_cm?: number | null
          min_sale_price?: number | null
          min_stock?: number
          name: string
          on_sale?: boolean
          op_cost_pct?: number
          price?: number
          price_pdv?: number | null
          product_id: string
          sale_ends_at?: string | null
          sale_limit_qty?: number | null
          sale_price?: number | null
          sale_sold_qty?: number
          sku?: string | null
          stock?: number
          tax_pct?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          cost?: number | null
          cost_group_id?: string | null
          created_at?: string
          description?: string | null
          freight_pct?: number
          height_cm?: number | null
          id?: string
          image_url?: string | null
          length_cm?: number | null
          min_sale_price?: number | null
          min_stock?: number
          name?: string
          on_sale?: boolean
          op_cost_pct?: number
          price?: number
          price_pdv?: number | null
          product_id?: string
          sale_ends_at?: string | null
          sale_limit_qty?: number | null
          sale_price?: number | null
          sale_sold_qty?: number
          sku?: string | null
          stock?: number
          tax_pct?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_cost_group_id_fkey"
            columns: ["cost_group_id"]
            isOneToOne: false
            referencedRelation: "cost_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string
          cest: string | null
          cfop: string | null
          cost: number | null
          cost_group_id: string | null
          created_at: string
          created_by: string | null
          csosn: string | null
          description: string
          featured: boolean
          freight_pct: number
          height_cm: number | null
          id: string
          image_url: string | null
          images: string[] | null
          include_in_nfe: boolean
          length_cm: number | null
          min_sale_price: number | null
          min_stock: number
          minimum_quantity: number
          name: string
          ncm: string | null
          on_sale: boolean
          op_cost_pct: number
          origem: string | null
          pdv_no_markup: boolean
          pdv_only: boolean
          pound_test: string | null
          price: number
          price_cash_percent: number
          price_credit_percent: number
          price_debit_percent: number
          price_pdv: number | null
          price_pdv_cash: number | null
          price_pdv_credit: number | null
          price_pdv_debit: number | null
          price_pdv_pix: number | null
          price_pix_percent: number
          rating: number | null
          sale_ends_at: string | null
          sale_limit_qty: number | null
          sale_price: number | null
          sale_sold_qty: number
          short_description: string | null
          size: string | null
          sku: string | null
          sold_by_weight: boolean
          stock: number
          subcategory: string | null
          supplier_id: string | null
          tax_pct: number
          unidade_comercial: string | null
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          brand?: string | null
          category: string
          cest?: string | null
          cfop?: string | null
          cost?: number | null
          cost_group_id?: string | null
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          description: string
          featured?: boolean
          freight_pct?: number
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean
          length_cm?: number | null
          min_sale_price?: number | null
          min_stock?: number
          minimum_quantity?: number
          name: string
          ncm?: string | null
          on_sale?: boolean
          op_cost_pct?: number
          origem?: string | null
          pdv_no_markup?: boolean
          pdv_only?: boolean
          pound_test?: string | null
          price: number
          price_cash_percent?: number
          price_credit_percent?: number
          price_debit_percent?: number
          price_pdv?: number | null
          price_pdv_cash?: number | null
          price_pdv_credit?: number | null
          price_pdv_debit?: number | null
          price_pdv_pix?: number | null
          price_pix_percent?: number
          rating?: number | null
          sale_ends_at?: string | null
          sale_limit_qty?: number | null
          sale_price?: number | null
          sale_sold_qty?: number
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean
          stock?: number
          subcategory?: string | null
          supplier_id?: string | null
          tax_pct?: number
          unidade_comercial?: string | null
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          brand?: string | null
          category?: string
          cest?: string | null
          cfop?: string | null
          cost?: number | null
          cost_group_id?: string | null
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          description?: string
          featured?: boolean
          freight_pct?: number
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean
          length_cm?: number | null
          min_sale_price?: number | null
          min_stock?: number
          minimum_quantity?: number
          name?: string
          ncm?: string | null
          on_sale?: boolean
          op_cost_pct?: number
          origem?: string | null
          pdv_no_markup?: boolean
          pdv_only?: boolean
          pound_test?: string | null
          price?: number
          price_cash_percent?: number
          price_credit_percent?: number
          price_debit_percent?: number
          price_pdv?: number | null
          price_pdv_cash?: number | null
          price_pdv_credit?: number | null
          price_pdv_debit?: number | null
          price_pdv_pix?: number | null
          price_pix_percent?: number
          rating?: number | null
          sale_ends_at?: string | null
          sale_limit_qty?: number | null
          sale_price?: number | null
          sale_sold_qty?: number
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean
          stock?: number
          subcategory?: string | null
          supplier_id?: string | null
          tax_pct?: number
          unidade_comercial?: string | null
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_cost_group_id_fkey"
            columns: ["cost_group_id"]
            isOneToOne: false
            referencedRelation: "cost_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cep: string | null
          cpf: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_list_items: {
        Row: {
          added_by: string
          created_at: string
          id: string
          list_id: string
          product_id: string
          quantity: number
          updated_at: string
          variation_id: string | null
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          list_id: string
          product_id: string
          quantity?: number
          updated_at?: string
          variation_id?: string | null
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          list_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "purchase_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lists: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string
          created_at: string
          id: string
          order_id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: string | null
          card_exp_year: string | null
          card_last4: string | null
          cardholder_name: string | null
          created_at: string
          id: string
          is_default: boolean
          last_used_at: string | null
          payment_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          payment_method: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last_used_at?: string | null
          payment_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_sales: {
        Row: {
          cart_data: Json
          created_at: string
          customer_data: Json | null
          id: string
          notes: string | null
          payment_method: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cart_data: Json
          created_at?: string
          customer_data?: Json | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cart_data?: Json
          created_at?: string
          customer_data?: Json | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_visits: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          path: string
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          path: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stock_audit_discrepancies: {
        Row: {
          created_at: string
          current_stock: number
          difference: number
          expected_stock: number
          id: string
          movements_summary: Json | null
          probable_cause: string | null
          product_id: string
          product_name: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          run_id: string
          sku: string | null
          variation_id: string | null
          variation_name: string | null
        }
        Insert: {
          created_at?: string
          current_stock: number
          difference: number
          expected_stock: number
          id?: string
          movements_summary?: Json | null
          probable_cause?: string | null
          product_id: string
          product_name: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          run_id: string
          sku?: string | null
          variation_id?: string | null
          variation_name?: string | null
        }
        Update: {
          created_at?: string
          current_stock?: number
          difference?: number
          expected_stock?: number
          id?: string
          movements_summary?: Json | null
          probable_cause?: string | null
          product_id?: string
          product_name?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string
          sku?: string | null
          variation_id?: string | null
          variation_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_audit_discrepancies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "stock_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audit_runs: {
        Row: {
          backup_xml_size: number | null
          created_at: string
          discrepancy_count: number
          email_message_id: string | null
          email_sent: boolean
          error_message: string | null
          id: string
          ok_count: number
          run_at: string
          status: string
          total_skus: number
        }
        Insert: {
          backup_xml_size?: number | null
          created_at?: string
          discrepancy_count?: number
          email_message_id?: string | null
          email_sent?: boolean
          error_message?: string | null
          id?: string
          ok_count?: number
          run_at?: string
          status?: string
          total_skus?: number
        }
        Update: {
          backup_xml_size?: number | null
          created_at?: string
          discrepancy_count?: number
          email_message_id?: string | null
          email_sent?: boolean
          error_message?: string | null
          id?: string
          ok_count?: number
          run_at?: string
          status?: string
          total_skus?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          order_id: string | null
          performed_by: string | null
          product_id: string
          quantity_delta: number
          reason: string | null
          stock_after: number
          stock_before: number
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          order_id?: string | null
          performed_by?: string | null
          product_id: string
          quantity_delta: number
          reason?: string | null
          stock_after: number
          stock_before: number
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          order_id?: string | null
          performed_by?: string | null
          product_id?: string
          quantity_delta?: number
          reason?: string | null
          stock_after?: number
          stock_before?: number
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          released_at: string | null
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          released_at?: string | null
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          released_at?: string | null
          variation_id?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          created_by: string | null
          id: string
          inscricao_estadual: string | null
          is_active: boolean
          logradouro: string | null
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          prazo_pagamento_dias: number | null
          razao_social: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          logradouro?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          prazo_pagamento_dias?: number | null
          razao_social: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          logradouro?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          prazo_pagamento_dias?: number | null
          razao_social?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tef_settings: {
        Row: {
          agent_url: string | null
          auto_print_receipt: boolean
          created_at: string
          enabled: boolean
          environment: string
          id: string
          mode: string
          stone_code: string | null
          updated_at: string
        }
        Insert: {
          agent_url?: string | null
          auto_print_receipt?: boolean
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          mode?: string
          stone_code?: string | null
          updated_at?: string
        }
        Update: {
          agent_url?: string | null
          auto_print_receipt?: boolean
          created_at?: string
          enabled?: boolean
          environment?: string
          id?: string
          mode?: string
          stone_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tef_transactions: {
        Row: {
          amount: number
          authorization_code: string | null
          card_brand: string | null
          card_last_digits: string | null
          created_at: string
          error_message: string | null
          id: string
          installments: number
          nsu: string | null
          order_id: string | null
          payment_method: string
          performed_by: string | null
          raw_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          authorization_code?: string | null
          card_brand?: string | null
          card_last_digits?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          installments?: number
          nsu?: string | null
          order_id?: string | null
          payment_method: string
          performed_by?: string | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          authorization_code?: string | null
          card_brand?: string | null
          card_last_digits?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          installments?: number
          nsu?: string | null
          order_id?: string | null
          payment_method?: string
          performed_by?: string | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tef_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_sync_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string | null
          request_data: Json | null
          response_data: Json | null
          status: string
          sync_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status: string
          sync_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tga_sync_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          cep: string
          city: string
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          neighborhood: string
          number: string
          recipient_name: string
          recipient_phone: string | null
          state: string
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cep: string
          city: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          neighborhood: string
          number: string
          recipient_name: string
          recipient_phone?: string | null
          state: string
          street: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cep?: string
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          neighborhood?: string
          number?: string
          recipient_name?: string
          recipient_phone?: string | null
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_customer_score: {
        Args: {
          p_customer_id: string
          p_delta: number
          p_order_id?: string
          p_reason: string
          p_source?: string
        }
        Returns: Json
      }
      add_label_pending: {
        Args: { p_product_id: string; p_qty: number; p_variation_id: string }
        Returns: string
      }
      apply_stock_movement: {
        Args: {
          p_movement_type: string
          p_order_id?: string
          p_product_id: string
          p_quantity_delta: number
          p_reason?: string
          p_variation_id: string
        }
        Returns: Json
      }
      can_access_pdv: { Args: { _user_id: string }; Returns: boolean }
      check_fiscal_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests: number
          p_user_id: string
          p_window_hours: number
        }
        Returns: boolean
      }
      cleanup_old_logs: { Args: never; Returns: Json }
      consume_promo_limits: { Args: { p_items: Json }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      extract_uf_from_address: { Args: { p_address: string }; Returns: string }
      get_available_stock: {
        Args: { p_product_id: string; p_variation_id?: string }
        Returns: number
      }
      get_cfop_by_uf: {
        Args: { p_has_st?: boolean; p_uf_destino: string }
        Returns: string
      }
      get_my_reviewed_products: {
        Args: never
        Returns: {
          order_id: string
          product_id: string
        }[]
      }
      get_product_admin: {
        Args: { p_id: string }
        Returns: {
          brand: string | null
          category: string
          cest: string | null
          cfop: string | null
          cost: number | null
          cost_group_id: string | null
          created_at: string
          created_by: string | null
          csosn: string | null
          description: string
          featured: boolean
          freight_pct: number
          height_cm: number | null
          id: string
          image_url: string | null
          images: string[] | null
          include_in_nfe: boolean
          length_cm: number | null
          min_sale_price: number | null
          min_stock: number
          minimum_quantity: number
          name: string
          ncm: string | null
          on_sale: boolean
          op_cost_pct: number
          origem: string | null
          pdv_no_markup: boolean
          pdv_only: boolean
          pound_test: string | null
          price: number
          price_cash_percent: number
          price_credit_percent: number
          price_debit_percent: number
          price_pdv: number | null
          price_pdv_cash: number | null
          price_pdv_credit: number | null
          price_pdv_debit: number | null
          price_pdv_pix: number | null
          price_pix_percent: number
          rating: number | null
          sale_ends_at: string | null
          sale_limit_qty: number | null
          sale_price: number | null
          sale_sold_qty: number
          short_description: string | null
          size: string | null
          sku: string | null
          sold_by_weight: boolean
          stock: number
          subcategory: string | null
          supplier_id: string | null
          tax_pct: number
          unidade_comercial: string | null
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_product_variations_admin: {
        Args: never
        Returns: {
          cost: number | null
          cost_group_id: string | null
          created_at: string
          description: string | null
          freight_pct: number
          height_cm: number | null
          id: string
          image_url: string | null
          length_cm: number | null
          min_sale_price: number | null
          min_stock: number
          name: string
          on_sale: boolean
          op_cost_pct: number
          price: number
          price_pdv: number | null
          product_id: string
          sale_ends_at: string | null
          sale_limit_qty: number | null
          sale_price: number | null
          sale_sold_qty: number
          sku: string | null
          stock: number
          tax_pct: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "product_variations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_products_admin: {
        Args: never
        Returns: {
          brand: string | null
          category: string
          cest: string | null
          cfop: string | null
          cost: number | null
          cost_group_id: string | null
          created_at: string
          created_by: string | null
          csosn: string | null
          description: string
          featured: boolean
          freight_pct: number
          height_cm: number | null
          id: string
          image_url: string | null
          images: string[] | null
          include_in_nfe: boolean
          length_cm: number | null
          min_sale_price: number | null
          min_stock: number
          minimum_quantity: number
          name: string
          ncm: string | null
          on_sale: boolean
          op_cost_pct: number
          origem: string | null
          pdv_no_markup: boolean
          pdv_only: boolean
          pound_test: string | null
          price: number
          price_cash_percent: number
          price_credit_percent: number
          price_debit_percent: number
          price_pdv: number | null
          price_pdv_cash: number | null
          price_pdv_credit: number | null
          price_pdv_debit: number | null
          price_pdv_pix: number | null
          price_pix_percent: number
          rating: number | null
          sale_ends_at: string | null
          sale_limit_qty: number | null
          sale_price: number | null
          sale_sold_qty: number
          short_description: string | null
          size: string | null
          sku: string | null
          sold_by_weight: boolean
          stock: number
          subcategory: string | null
          supplier_id: string | null
          tax_pct: number
          unidade_comercial: string | null
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_products_with_stock_discrepancy: {
        Args: never
        Returns: {
          discrepancy_count: number
          last_run_at: string
          product_id: string
        }[]
      }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_access: {
        Args: {
          p_accessed_user_id?: string
          p_action: string
          p_details?: Json
          p_record_id?: string
          p_table_name: string
        }
        Returns: string
      }
      mark_labels_printed: {
        Args: { p_product_id: string; p_qty: number; p_variation_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_stock: {
        Args: { p_product_id: string; p_variation_id?: string }
        Returns: Json
      }
      release_promo_limits: { Args: { p_items: Json }; Returns: undefined }
      release_stock_reservation: { Args: { p_order_id: string }; Returns: Json }
      reserve_stock_for_order: {
        Args: { p_items: Json; p_order_id: string; p_ttl_minutes?: number }
        Returns: Json
      }
      revert_order_stock: { Args: { p_order_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sku_needs_label: { Args: { _sku: string }; Returns: boolean }
      validate_coupon: {
        Args: { p_code: string; p_source?: string; p_subtotal: number }
        Returns: Json
      }
      validate_order_fiscal: {
        Args: { p_order_id: string }
        Returns: {
          missing_fields: string[]
          product_id: string
          product_name: string
        }[]
      }
      verify_cron_secret: { Args: { _secret: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "employee" | "user"
      coupon_scope: "site" | "pdv" | "both"
      coupon_type: "percent" | "fixed" | "free_shipping"
      order_status:
        | "em_preparo"
        | "enviado"
        | "entregado"
        | "aguardando_pagamento"
        | "retirado"
        | "cancelado"
        | "devolvido"
        | "devolucao_solicitada"
        | "aguardando_envio"
      reward_effect:
        | "discount_percent"
        | "free_gift"
        | "block_purchase"
        | "block_discount"
        | "note"
      reward_kind: "reward" | "punishment"
      reward_scope: "customer" | "tier"
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
      app_role: ["admin", "employee", "user"],
      coupon_scope: ["site", "pdv", "both"],
      coupon_type: ["percent", "fixed", "free_shipping"],
      order_status: [
        "em_preparo",
        "enviado",
        "entregado",
        "aguardando_pagamento",
        "retirado",
        "cancelado",
        "devolvido",
        "devolucao_solicitada",
        "aguardando_envio",
      ],
      reward_effect: [
        "discount_percent",
        "free_gift",
        "block_purchase",
        "block_discount",
        "note",
      ],
      reward_kind: ["reward", "punishment"],
      reward_scope: ["customer", "tier"],
    },
  },
} as const
