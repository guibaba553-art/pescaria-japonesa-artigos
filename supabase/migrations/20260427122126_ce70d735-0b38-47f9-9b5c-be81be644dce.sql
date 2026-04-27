ALTER TABLE public.employee_permissions
  ADD COLUMN IF NOT EXISTS can_access_catalog boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_cash_register boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_dashboard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_sales_analysis boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_triagem boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_fiscal boolean NOT NULL DEFAULT false;