ALTER TABLE public.orders DISABLE TRIGGER USER;
UPDATE public.orders SET status='em_preparo', cancellation_reason=NULL, updated_at=now() WHERE id='d5e0ce4d-1f9d-46e2-a2cd-75f72d3c5c29';
ALTER TABLE public.orders ENABLE TRIGGER USER;