-- Helora 033: servidores numerados (1, 2, 3…) no lugar de "main"
alter table accounts alter column server_id set default '1';
update accounts set server_id = '1' where server_id = 'main' or server_id is null;
notify pgrst, 'reload schema';
