-- Migration 019: cobrança automática (Asaas/PIX) e bloqueio por falta de pagamento.
alter table invoices add column if not exists asaas_payment_id text;
alter table invoices add column if not exists invoice_url text;
alter table invoices add column if not exists available_sent_at timestamptz;
alter table invoices add column if not exists reminder_sent_at timestamptz;
create index if not exists invoices_asaas_idx on invoices (asaas_payment_id);
alter table accounts add column if not exists asaas_customer_id text;
alter table accounts add column if not exists blocked_reason text;   -- 'billing' quando bloqueada por falta de pagamento
alter table accounts add column if not exists welcome_sent_at timestamptz;
notify pgrst, 'reload schema';
