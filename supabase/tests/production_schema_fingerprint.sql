\pset tuples_only on
\pset format unaligned

with
cols as (
 select format('%I.%I|%s|%I|%s|%s|%s|%s',table_schema,table_name,ordinal_position,column_name,data_type,udt_name,is_nullable,coalesce(column_default,'')) as s
 from information_schema.columns where table_schema in ('public','private') order by 1
), cons as (
 select format('%I.%I|%I|%s',n.nspname,c.relname,con.conname,pg_get_constraintdef(con.oid,true)) as s
 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') order by 1
), idx as (
 select pg_get_indexdef(i.indexrelid) as s
 from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private') order by 1
), funcs as (
 select pg_get_functiondef(p.oid) as s from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
), pol as (
 select format('%I.%I|%I|%s|%s|%s|%s|%s',schemaname,tablename,policyname,permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,'')) as s
 from pg_policies where schemaname in ('public','private') order by 1
), trg as (
 select pg_get_triggerdef(t.oid,true) as s from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and n.nspname in ('public','private') order by 1
)
select jsonb_build_object(
 'columns',jsonb_build_object('count',(select count(*) from cols),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from cols)),
 'constraints',jsonb_build_object('count',(select count(*) from cons),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from cons)),
 'indexes',jsonb_build_object('count',(select count(*) from idx),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from idx)),
 'functions',jsonb_build_object('count',(select count(*) from funcs),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from funcs)),
 'policies',jsonb_build_object('count',(select count(*) from pol),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from pol)),
 'triggers',jsonb_build_object('count',(select count(*) from trg),'sha256',(select encode(digest(coalesce(string_agg(s,E'\n' order by s),''),'sha256'),'hex') from trg))
);
