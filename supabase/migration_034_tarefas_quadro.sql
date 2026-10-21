-- V7: Tarefas estilo Trello (quadro, checklist, anexos, comentários, prioridade, etiquetas)
alter table tasks add column if not exists stage text not null default 'todo';
alter table tasks add column if not exists priority text not null default 'normal';
alter table tasks add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists comments jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists labels jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists position double precision;
update tasks set stage = 'done' where status = 'done' and stage <> 'done';
notify pgrst, 'reload schema';
