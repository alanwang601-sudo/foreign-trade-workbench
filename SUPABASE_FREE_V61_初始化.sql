-- 外贸工作台 V6.1 · Supabase Free 初始化 SQL
-- 在“新建的 Free 项目”SQL Editor 中执行。
-- 兼容当前纯前端同步结构。

create table if not exists public.customers (id text primary key, data text not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.ai_history (id text primary key, data text not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.market_analyses (id text primary key, data text not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.calendar (id text primary key, data text not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.settings (id text primary key, data text not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.health_check (id text primary key, updated_at timestamptz not null default now());
insert into public.health_check(id) values ('ftw') on conflict (id) do nothing;

-- V6.1 兼容模式：前端使用 publishable/anon key 直接同步。
-- 注意：这意味着业务表的 anon 访问较宽松。不要把这套策略用于多用户或敏感数据系统。
do $$
declare t text;
begin
  foreach t in array array['customers','ai_history','market_analyses','calendar','settings','health_check'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
  end loop;
end $$;

-- 避免重复建 policy。
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='ftw_anon_all') then create policy ftw_anon_all on public.customers for all to anon using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_history' and policyname='ftw_anon_all') then create policy ftw_anon_all on public.ai_history for all to anon using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_analyses' and policyname='ftw_anon_all') then create policy ftw_anon_all on public.market_analyses for all to anon using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='calendar' and policyname='ftw_anon_all') then create policy ftw_anon_all on public.calendar for all to anon using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='settings' and policyname='ftw_anon_all') then create policy ftw_anon_all on public.settings for all to anon using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='health_check' and policyname='ftw_anon_read') then create policy ftw_anon_read on public.health_check for select to anon using (true); end if;
end $$;
