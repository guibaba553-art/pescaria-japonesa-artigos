-- Backfill Asaas orders (have asaas_payment_id)
UPDATE orders 
SET payment_gateway = 'asaas' 
WHERE payment_gateway IS NULL 
  AND asaas_payment_id IS NOT NULL;

-- Backfill Mercado Pago orders (legacy create-payment did not set it)
UPDATE orders 
SET payment_gateway = 'mercadopago' 
WHERE payment_gateway IS NULL 
  AND payment_id IS NOT NULL
  AND asaas_payment_id IS NULL
  AND payment_method IN ('pix', 'credit_card', 'debit_card');

-- Backfill AbacatePay orders (was never used in production, but belt-and-suspenders)
UPDATE orders 
SET payment_gateway = 'abacatepay' 
WHERE payment_gateway IS NULL 
  AND payment_id IS NOT NULL
  AND asaas_payment_id IS NULL
  AND payment_method = 'abacatepay_checkout';
