ALTER TABLE public.order_items DROP CONSTRAINT order_items_product_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.order_items DROP CONSTRAINT order_items_variation_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_product_id_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_variation_id_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE RESTRICT;