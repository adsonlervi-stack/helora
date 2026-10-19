-- Migration 028: forma de cobrança por empresa (asaas = recorrente automática por PIX; manual = boleto anexado pela Gestora).
alter table accounts add column if not exists billing_method text not null default 'manual';
notify pgrst, 'reload schema';
