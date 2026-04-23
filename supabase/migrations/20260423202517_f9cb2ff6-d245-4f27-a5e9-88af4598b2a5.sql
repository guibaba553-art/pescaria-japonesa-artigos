-- Create categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Anyone can view categories (public catalog)
CREATE POLICY "Categories are viewable by everyone"
ON public.categories
FOR SELECT
USING (true);

-- Only admins can insert
CREATE POLICY "Admins can create categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update
CREATE POLICY "Admins can update categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins can delete categories"
ON public.categories
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Index on display_order for sorting
CREATE INDEX idx_categories_display_order ON public.categories(display_order);

-- Seed with current categories so existing products don't break
INSERT INTO public.categories (name, slug, icon, display_order) VALUES
  ('Varas', 'varas', 'Fish', 1),
  ('Molinetes', 'molinetes', 'Anchor', 2),
  ('Carretilhas', 'carretilhas', 'Waves', 3),
  ('Iscas', 'iscas', 'Worm', 4),
  ('Anzóis', 'anzois', 'Hook', 5),
  ('Linhas', 'linhas', 'Cable', 6),
  ('Acessórios', 'acessorios', 'Package', 7);