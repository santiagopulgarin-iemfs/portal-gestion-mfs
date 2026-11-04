-- Portal de Gestión I.E. Marco Fidel Suárez: esquema inicial
-- Autenticación: Supabase Auth (Google). Autorización: tabla allowed_emails.

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  role  text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_docs (
  key  text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Rol del usuario autenticado (null si no está en la lista). SECURITY DEFINER para poder
-- consultar allowed_emails sin que las políticas se llamen a sí mismas ni exponer la tabla.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.allowed_emails
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- Sella updated_at / updated_by en el servidor (no confiar en el cliente).
create or replace function public.app_docs_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', new.updated_by));
  return new;
end;
$$;

drop trigger if exists app_docs_stamp on public.app_docs;
create trigger app_docs_stamp
  before insert or update on public.app_docs
  for each row execute function public.app_docs_stamp();

-- RLS
alter table public.allowed_emails enable row level security;
alter table public.app_docs enable row level security;

revoke all on public.allowed_emails, public.app_docs from anon;

drop policy if exists allowed_emails_admin_all on public.allowed_emails;
create policy allowed_emails_admin_all on public.allowed_emails
  for all to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

drop policy if exists app_docs_select on public.app_docs;
create policy app_docs_select on public.app_docs
  for select to authenticated
  using (public.app_role() is not null);

drop policy if exists app_docs_insert on public.app_docs;
create policy app_docs_insert on public.app_docs
  for insert to authenticated
  with check (public.app_role() in ('admin', 'editor'));

drop policy if exists app_docs_update on public.app_docs;
create policy app_docs_update on public.app_docs
  for update to authenticated
  using (public.app_role() in ('admin', 'editor'))
  with check (public.app_role() in ('admin', 'editor'));

grant select, insert, update on public.app_docs to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;

-- Realtime para sincronizar entre usuarios
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_docs'
  ) then
    alter publication supabase_realtime add table public.app_docs;
  end if;
end $$;

-- Seed de la lista de autorizados
insert into public.allowed_emails (email, role)
values ('pulgarinsantiago1a@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;
