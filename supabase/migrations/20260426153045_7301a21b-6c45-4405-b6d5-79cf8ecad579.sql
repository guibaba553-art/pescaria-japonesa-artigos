-- Adiciona o status 'cancelado' ao enum de pedidos
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelado';