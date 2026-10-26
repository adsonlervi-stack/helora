-- Migration 036: produtos e subprodutos no CRM (ex.: Automóvel > Auto passeio)
alter table crm_products add column if not exists parent_id uuid references crm_products(id) on delete cascade;
create index if not exists crm_products_parent_idx on crm_products(parent_id);
