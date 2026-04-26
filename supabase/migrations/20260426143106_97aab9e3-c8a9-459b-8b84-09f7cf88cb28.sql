-- ============================================
-- FORNECEDORES
-- ============================================
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT,
  inscricao_estadual TEXT,
  contato_nome TEXT,
  contato_telefone TEXT,
  contato_email TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  prazo_pagamento_dias INTEGER DEFAULT 0,
  observacoes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_suppliers_cnpj ON public.suppliers(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_suppliers_active ON public.suppliers(is_active);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e funcionarios podem ver fornecedores"
  ON public.suppliers FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e funcionarios podem criar fornecedores"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e funcionarios podem atualizar fornecedores"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins podem deletar fornecedores"
  ON public.suppliers FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- ESTOQUE MÍNIMO + CUSTO + FORNECEDOR EM PRODUTOS
-- ============================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON public.products(stock, min_stock) WHERE stock <= min_stock;

-- ============================================
-- CUPONS DE DESCONTO
-- ============================================
CREATE TYPE public.coupon_type AS ENUM ('percent', 'fixed', 'free_shipping');
CREATE TYPE public.coupon_scope AS ENUM ('site', 'pdv', 'both');

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type public.coupon_type NOT NULL,
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_purchase NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(10,2),
  scope public.coupon_scope NOT NULL DEFAULT 'both',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER,
  usage_limit_per_user INTEGER DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_coupons_code ON public.coupons(code);
CREATE INDEX idx_coupons_active ON public.coupons(is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ver cupons ativos para validar"
  ON public.coupons FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Admins veem todos os cupons"
  ON public.coupons FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins criam cupons"
  ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins atualizam cupons"
  ON public.coupons FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins deletam cupons"
  ON public.coupons FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- RESGATES DE CUPONS
-- ============================================
CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID,
  order_id UUID,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'site',
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_redemptions_coupon ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_redemptions_user ON public.coupon_redemptions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_redemptions_order ON public.coupon_redemptions(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todos resgates"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Usuario ve seus proprios resgates"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Sistema registra resgates"
  ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'employee'::app_role)
  );

-- ============================================
-- FUNÇÃO PARA VALIDAR E APLICAR CUPOM
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code TEXT,
  p_subtotal NUMERIC,
  p_source TEXT DEFAULT 'site'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon RECORD;
  v_user_id UUID;
  v_user_uses INTEGER;
  v_discount NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE upper(code) = upper(p_code) AND is_active = true
  LIMIT 1;

  IF v_coupon.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não encontrado ou inativo');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom ainda não está válido');
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom expirado');
  END IF;

  IF v_coupon.scope = 'site' AND p_source = 'pdv' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom válido apenas no site');
  END IF;

  IF v_coupon.scope = 'pdv' AND p_source = 'site' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom válido apenas no PDV');
  END IF;

  IF p_subtotal < v_coupon.min_purchase THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Valor mínimo de R$ ' || v_coupon.min_purchase || ' não atingido'
    );
  END IF;

  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotou o limite de usos');
  END IF;

  IF v_user_id IS NOT NULL AND v_coupon.usage_limit_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_uses
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id AND user_id = v_user_id;

    IF v_user_uses >= v_coupon.usage_limit_per_user THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Você já usou este cupom');
    END IF;
  END IF;

  -- Calcular desconto
  IF v_coupon.type = 'percent' THEN
    v_discount := p_subtotal * (v_coupon.value / 100);
    IF v_coupon.max_discount IS NOT NULL AND v_discount > v_coupon.max_discount THEN
      v_discount := v_coupon.max_discount;
    END IF;
  ELSIF v_coupon.type = 'fixed' THEN
    v_discount := LEAST(v_coupon.value, p_subtotal);
  ELSIF v_coupon.type = 'free_shipping' THEN
    v_discount := 0; -- frete é zerado no app
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'type', v_coupon.type,
    'value', v_coupon.value,
    'discount_amount', v_discount,
    'description', v_coupon.description
  );
END;
$$;