CREATE TYPE public.reward_kind AS ENUM ('reward', 'punishment');
CREATE TYPE public.reward_scope AS ENUM ('customer', 'tier');
CREATE TYPE public.reward_effect AS ENUM ('discount_percent', 'free_gift', 'block_purchase', 'block_discount', 'note');

CREATE TABLE public.customer_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.reward_kind NOT NULL,
  scope public.reward_scope NOT NULL,
  customer_id uuid,
  tier_id uuid,
  title text NOT NULL,
  description text,
  effect public.reward_effect NOT NULL DEFAULT 'note',
  value numeric,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_target_chk CHECK (
    (scope = 'customer' AND customer_id IS NOT NULL AND tier_id IS NULL) OR
    (scope = 'tier' AND tier_id IS NOT NULL AND customer_id IS NULL)
  )
);

CREATE INDEX idx_customer_rewards_customer ON public.customer_rewards(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_customer_rewards_tier ON public.customer_rewards(tier_id) WHERE tier_id IS NOT NULL;
CREATE INDEX idx_customer_rewards_active ON public.customer_rewards(is_active);

ALTER TABLE public.customer_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/employee veem rewards"
ON public.customer_rewards FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admin gerencia rewards"
ON public.customer_rewards FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_customer_rewards_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_customer_rewards_updated
BEFORE UPDATE ON public.customer_rewards
FOR EACH ROW EXECUTE FUNCTION public.touch_customer_rewards_updated_at();