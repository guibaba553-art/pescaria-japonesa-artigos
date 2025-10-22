-- Adicionar colunas para armazenar dados do PIX nos pedidos
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS qr_code TEXT,
ADD COLUMN IF NOT EXISTS qr_code_base64 TEXT,
ADD COLUMN IF NOT EXISTS ticket_url TEXT,
ADD COLUMN IF NOT EXISTS pix_expiration TIMESTAMP WITH TIME ZONE;

-- Comentários para documentação
COMMENT ON COLUMN public.orders.qr_code IS 'Código PIX para copiar e colar';
COMMENT ON COLUMN public.orders.qr_code_base64 IS 'Imagem do QR code em base64';
COMMENT ON COLUMN public.orders.ticket_url IS 'URL do ticket de pagamento do Mercado Pago';
COMMENT ON COLUMN public.orders.pix_expiration IS 'Data de expiração do QR code PIX';