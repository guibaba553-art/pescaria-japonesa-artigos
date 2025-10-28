-- ============================================
-- OTIMIZAÇÃO DO BANCO DE DADOS
-- Adiciona índices para melhor performance
-- NÃO EXCLUI NENHUM DADO
-- ============================================

-- Habilitar extensão para busca de texto
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- ÍNDICES EM FOREIGN KEYS (para JOINs rápidos)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_product_id ON public.chat_messages(product_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_replied_by ON public.chat_messages(replied_by);
CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON public.product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_user_id ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_accessed_user_id ON public.admin_audit_log(accessed_user_id);

-- ============================================
-- ÍNDICES PARA BUSCAS E FILTROS FREQUENTES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_products_on_sale ON public.products(on_sale) WHERE on_sale = true;
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_rating ON public.products(rating DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_type ON public.orders(delivery_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_replied ON public.chat_messages(replied);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- ============================================
-- ÍNDICES COMPOSTOS PARA QUERIES COMPLEXAS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_user_status ON public.orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_featured ON public.products(category, featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_replied_created ON public.chat_messages(replied, created_at DESC) WHERE replied = false;
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews(product_id, created_at DESC);

-- ============================================
-- ÍNDICES GIN PARA BUSCA DE TEXTO
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_images ON public.products USING gin(images);

-- ============================================
-- ÍNDICES PARCIAIS PARA OTIMIZAÇÕES ESPECÍFICAS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment ON public.orders(id, created_at DESC) WHERE status = 'aguardando_pagamento';
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON public.products(id, stock) WHERE stock > 0;
CREATE INDEX IF NOT EXISTS idx_variations_in_stock ON public.product_variations(product_id, stock) WHERE stock > 0;

-- Atualizar estatísticas gerais
ANALYZE;