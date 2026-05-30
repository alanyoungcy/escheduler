create table if not exists app_healthchecks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  checked_at timestamptz not null default now()
);
