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
          {
            foreignKeyName: "chat_messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
          created_at: string
          email: string | null
          id: string
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
          created_at?: string
          email?: string | null
          id?: string
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
          created_at?: string
          email?: string | null
          id?: string
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
      customers: {
        Row: {
          cep: string
          cnpj: string | null
          company_name: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          neighborhood: string
          number: string
          street: string
          updated_at: string
        }
        Insert: {
          cep: string
          cnpj?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          neighborhood: string
          number: string
          street: string
          updated_at?: string
        }
        Update: {
          cep?: string
          cnpj?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          neighborhood?: string
          number?: string
          street?: string
          updated_at?: string
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
          created_at: string
          customer_id: string | null
          delivery_type: string
          id: string
          payment_id: string | null
          pix_expiration: string | null
          qr_code: string | null
          qr_code_base64: string | null
          shipping_address: string
          shipping_cep: string
          shipping_cost: number
          source: string
          status: Database["public"]["Enums"]["order_status"]
          ticket_url: string | null
          total_amount: number
          tracking_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          delivery_type?: string
          id?: string
          payment_id?: string | null
          pix_expiration?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          shipping_address: string
          shipping_cep: string
          shipping_cost?: number
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          ticket_url?: string | null
          total_amount: number
          tracking_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          delivery_type?: string
          id?: string
          payment_id?: string | null
          pix_expiration?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          shipping_address?: string
          shipping_cep?: string
          shipping_cost?: number
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
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
            foreignKeyName: "product_label_pending_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
          created_at: string
          description: string | null
          height_cm: number | null
          id: string
          image_url: string | null
          length_cm: number | null
          name: string
          price: number
          product_id: string
          sku: string | null
          stock: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          length_cm?: number | null
          name: string
          price?: number
          product_id: string
          sku?: string | null
          stock?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          length_cm?: number | null
          name?: string
          price?: number
          product_id?: string
          sku?: string | null
          stock?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
          created_at: string
          created_by: string | null
          csosn: string | null
          description: string
          featured: boolean
          height_cm: number | null
          id: string
          image_url: string | null
          images: string[] | null
          include_in_nfe: boolean
          length_cm: number | null
          min_stock: number
          minimum_quantity: number
          name: string
          ncm: string | null
          on_sale: boolean
          origem: string | null
          pound_test: string | null
          price: number
          price_cash_percent: number
          price_credit_percent: number
          price_debit_percent: number
          price_pdv: number | null
          price_pix_percent: number
          rating: number | null
          sale_ends_at: string | null
          sale_price: number | null
          short_description: string | null
          size: string | null
          sku: string | null
          sold_by_weight: boolean
          stock: number
          subcategory: string | null
          supplier_id: string | null
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
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          description: string
          featured?: boolean
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean
          length_cm?: number | null
          min_stock?: number
          minimum_quantity?: number
          name: string
          ncm?: string | null
          on_sale?: boolean
          origem?: string | null
          pound_test?: string | null
          price: number
          price_cash_percent?: number
          price_credit_percent?: number
          price_debit_percent?: number
          price_pdv?: number | null
          price_pix_percent?: number
          rating?: number | null
          sale_ends_at?: string | null
          sale_price?: number | null
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean
          stock?: number
          subcategory?: string | null
          supplier_id?: string | null
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
          created_at?: string
          created_by?: string | null
          csosn?: string | null
          description?: string
          featured?: boolean
          height_cm?: number | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean
          length_cm?: number | null
          min_stock?: number
          minimum_quantity?: number
          name?: string
          ncm?: string | null
          on_sale?: boolean
          origem?: string | null
          pound_test?: string | null
          price?: number
          price_cash_percent?: number
          price_credit_percent?: number
          price_debit_percent?: number
          price_pdv?: number | null
          price_pix_percent?: number
          rating?: number | null
          sale_ends_at?: string | null
          sale_price?: number | null
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean
          stock?: number
          subcategory?: string | null
          supplier_id?: string | null
          unidade_comercial?: string | null
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
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
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
      products_public: {
        Row: {
          brand: string | null
          category: string | null
          cest: string | null
          cfop: string | null
          created_at: string | null
          csosn: string | null
          description: string | null
          featured: boolean | null
          height_cm: number | null
          id: string | null
          image_url: string | null
          images: string[] | null
          include_in_nfe: boolean | null
          length_cm: number | null
          minimum_quantity: number | null
          name: string | null
          ncm: string | null
          on_sale: boolean | null
          origem: string | null
          pound_test: string | null
          price: number | null
          rating: number | null
          sale_ends_at: string | null
          sale_price: number | null
          short_description: string | null
          size: string | null
          sku: string | null
          sold_by_weight: boolean | null
          stock: number | null
          subcategory: string | null
          unidade_comercial: string | null
          updated_at: string | null
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          created_at?: string | null
          csosn?: string | null
          description?: string | null
          featured?: boolean | null
          height_cm?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean | null
          length_cm?: number | null
          minimum_quantity?: number | null
          name?: string | null
          ncm?: string | null
          on_sale?: boolean | null
          origem?: string | null
          pound_test?: string | null
          price?: number | null
          rating?: number | null
          sale_ends_at?: string | null
          sale_price?: number | null
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean | null
          stock?: number | null
          subcategory?: string | null
          unidade_comercial?: string | null
          updated_at?: string | null
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          cest?: string | null
          cfop?: string | null
          created_at?: string | null
          csosn?: string | null
          description?: string | null
          featured?: boolean | null
          height_cm?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          include_in_nfe?: boolean | null
          length_cm?: number | null
          minimum_quantity?: number | null
          name?: string | null
          ncm?: string | null
          on_sale?: boolean | null
          origem?: string | null
          pound_test?: string | null
          price?: number | null
          rating?: number | null
          sale_ends_at?: string | null
          sale_price?: number | null
          short_description?: string | null
          size?: string | null
          sku?: string | null
          sold_by_weight?: boolean | null
          stock?: number | null
          subcategory?: string | null
          unidade_comercial?: string | null
          updated_at?: string | null
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      check_fiscal_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests: number
          p_user_id: string
          p_window_hours: number
        }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
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
      revert_order_stock: { Args: { p_order_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sku_needs_label: { Args: { _sku: string }; Returns: boolean }
      validate_coupon: {
        Args: { p_code: string; p_source?: string; p_subtotal: number }
        Returns: Json
      }
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
    },
  },
} as const
