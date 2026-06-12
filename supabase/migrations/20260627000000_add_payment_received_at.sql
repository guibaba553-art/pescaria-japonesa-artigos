-- Add payment_received_at column to orders table for financial reconciliation
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;
