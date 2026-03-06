-- Secure app_state table with per-user isolation and optimistic versioning.
-- Note: this script migrates the old structure.

create table if not exists public.app_state (
  user_id uuid,
  id text not null,
  payload jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.app_state add column if not exists user_id uuid;
alter table public.app_state add column if not exists id text;
alter table public.app_state add column if not exists payload jsonb;
alter table public.app_state add column if not exists version integer;
alter table public.app_state add column if not exists updated_at timestamptz not null default now();

update public.app_state
set version = 1
where version is null;

-- Legacy rows (without auth user) are kept with a sentinel ID and become inaccessible.
update public.app_state
set user_id = '00000000-0000-0000-0000-000000000000'::uuid
where user_id is null;

alter table public.app_state
  alter column user_id set not null,
  alter column id set not null,
  alter column payload set not null,
  alter column version set not null,
  alter column version set default 1;

alter table public.app_state drop constraint if exists app_state_pkey;
alter table public.app_state add constraint app_state_pkey primary key (user_id, id);

create index if not exists app_state_user_updated_idx on public.app_state (user_id, updated_at desc);

create or replace function public.set_app_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row
execute function public.set_app_state_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "Allow public select app_state" on public.app_state;
drop policy if exists "Allow public insert app_state" on public.app_state;
drop policy if exists "Allow public update app_state" on public.app_state;
drop policy if exists "app_state_select_own" on public.app_state;
drop policy if exists "app_state_insert_own" on public.app_state;
drop policy if exists "app_state_update_own" on public.app_state;
drop policy if exists "app_state_delete_own" on public.app_state;

create policy "app_state_select_own"
  on public.app_state
  for select
  using (auth.uid() = user_id);

create policy "app_state_insert_own"
  on public.app_state
  for insert
  with check (auth.uid() = user_id);

create policy "app_state_update_own"
  on public.app_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "app_state_delete_own"
  on public.app_state
  for delete
  using (auth.uid() = user_id);
