-- Tarefa ligada ao card do CRM: concluir a tarefa atualiza o card
alter table public.tasks add column if not exists lead_id uuid references public.crm_leads(id) on delete set null;
create index if not exists tasks_lead_id_idx on public.tasks(lead_id);
