DELETE FROM public.customers
 WHERE id = '160ac3ff-04b5-4912-b75b-a1385edf37bd';

UPDATE public.customers
   SET cpf = '04505769810',
       full_name = 'ROBERTO MAMORU BABA',
       updated_at = now()
 WHERE id = 'e483653d-2621-4991-b055-433f7f54c755';