CREATE TABLE public.customer_score_reason_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  reason text NOT NULL,
  sign smallint NOT NULL DEFAULT 1 CHECK (sign IN (-1, 1)),
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  emoji text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_score_reason_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/employee veem presets"
ON public.customer_score_reason_presets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin gerencia presets"
ON public.customer_score_reason_presets FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_csrp_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_csrp_updated
BEFORE UPDATE ON public.customer_score_reason_presets
FOR EACH ROW EXECUTE FUNCTION public.touch_csrp_updated_at();

INSERT INTO public.customer_score_reason_presets (label, reason, sign, points, emoji, sort_order) VALUES
('Veio à loja e comprou no site (na loja)', 'Veio à loja, foi atendido e comprou no site dentro da loja (custo de atendimento + desconto do site)', -1, 2, '🏬➡️🌐', 10),
('Cliente fiel / recorrente', 'Cliente fiel / compra recorrente', 1, 1, '⭐', 20),
('Brinde / cortesia', 'Brinde / cortesia promocional', 1, 1, '🎁', 30),
('Indicou novo cliente', 'Indicou novo cliente', 1, 2, '🤝', 40),
('Elogio / avaliação positiva', 'Elogio público / avaliação positiva', 1, 1, '💬', 50),
('Cliente mal educado', 'Cliente mal educado / desrespeitoso', -1, 2, '😡', 60),
('Cliente chato / problemático', 'Cliente chato / problemático', -1, 1, '🙄', 70),
('Não retira pedido / sumiu', 'Não retirou o pedido / não respondeu', -1, 2, '📵', 80),
('Devolução sem ser defeito', 'Devolução sem ser por defeito do produto', -1, 1, '↩️', 90),
('Reclamação indevida', 'Reclamação indevida / má-fé', -1, 3, '⚠️', 100),
('Calote / não pagou', 'Calote / cheque devolvido / não pagou', -1, 5, '💸', 110);