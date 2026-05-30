create extension if not exists "pgcrypto";

create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_weekly_hours int not null check (max_weekly_hours > 0),
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'casual')),
  created_at timestamptz not null default now()
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table employee_skills (
  employee_id uuid not null references employees(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  primary key (employee_id, skill_id)
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  date date,
  start_time time not null,
  end_time time not null,
  type text not null check (type in ('available', 'preferred', 'unavailable')),
  check (day_of_week is not null or date is not null)
);

create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  hours numeric not null check (hours > 0)
);

create table coverage_needs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_template_id uuid not null references shift_templates(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  required_count int not null check (required_count >= 0),
  unique (date, shift_template_id, skill_id)
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'solving', 'published')),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  shift_template_id uuid not null references shift_templates(id) on delete cascade,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (schedule_id, employee_id, date),
  unique (schedule_id, date, shift_template_id, employee_id)
);

create table solve_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'done', 'infeasible', 'failed')),
  objective_value numeric,
  runtime_ms int,
  log jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assignments'
  ) then
    alter publication supabase_realtime add table assignments;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solve_runs'
  ) then
    alter publication supabase_realtime add table solve_runs;
  end if;
end $$;
