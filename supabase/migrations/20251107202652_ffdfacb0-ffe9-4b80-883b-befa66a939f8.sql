-- Adicionar campo para quantidade de produtos nas NFe
ALTER TABLE public.nfe_emissions 
ADD COLUMN products_count integer DEFAULT 0;