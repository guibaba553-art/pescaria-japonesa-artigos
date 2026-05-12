ALTER TABLE public.nfe_emissions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nfe_emissions;