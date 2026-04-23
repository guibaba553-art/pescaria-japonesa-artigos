-- Add hierarchy and primary flag
ALTER TABLE public.categories
  ADD COLUMN parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_categories_parent_id ON public.categories(parent_id);

-- Add subcategory to products
ALTER TABLE public.products
  ADD COLUMN subcategory TEXT;

CREATE INDEX idx_products_subcategory ON public.products(subcategory);

-- Mark existing seeded categories as primary
UPDATE public.categories
SET is_primary = true
WHERE name IN ('Varas', 'Molinetes', 'Carretilhas', 'Iscas', 'Anzóis', 'Linhas', 'Acessórios');

-- Ensure Molinetes and Carretilhas exist as separate primaries
INSERT INTO public.categories (name, slug, icon, display_order, is_primary)
VALUES ('Molinetes', 'molinetes', 'Anchor', 2, true)
ON CONFLICT (name) DO UPDATE SET is_primary = true;

INSERT INTO public.categories (name, slug, icon, display_order, is_primary)
VALUES ('Carretilhas', 'carretilhas', 'Waves', 3, true)
ON CONFLICT (name) DO UPDATE SET is_primary = true;

-- Trigger to protect primary categories
CREATE OR REPLACE FUNCTION public.protect_primary_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary THEN
      RAISE EXCEPTION 'Categorias primárias não podem ser excluídas';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Cannot demote a primary
    IF OLD.is_primary AND NOT NEW.is_primary THEN
      RAISE EXCEPTION 'Não é possível remover o status de primária';
    END IF;
    -- Cannot rename a primary
    IF OLD.is_primary AND OLD.name <> NEW.name THEN
      RAISE EXCEPTION 'Categorias primárias não podem ser renomeadas';
    END IF;
    -- A primary cannot have a parent
    IF NEW.is_primary AND NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Categorias primárias não podem ter pai';
    END IF;
    -- A subcategory cannot be its own parent
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Uma categoria não pode ser pai de si mesma';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_primary AND NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Categorias primárias não podem ter pai';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_primary_categories_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.protect_primary_categories();