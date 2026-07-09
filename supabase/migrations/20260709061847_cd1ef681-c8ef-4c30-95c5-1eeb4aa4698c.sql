create table if not exists public.site_alerts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  tone text not null default 'info' check (tone in ('info','success','warning','danger')),
  active boolean not null default true,
  link_url text,
  link_label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

grant select on public.site_alerts to anon, authenticated;
grant all on public.site_alerts to service_role;

alter table public.site_alerts enable row level security;

create policy "Public reads active alerts"
  on public.site_alerts for select
  to anon, authenticated
  using (active = true and (expires_at is null or expires_at > now()));

create policy "Admins manage alerts"
  on public.site_alerts for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists site_alerts_active_idx on public.site_alerts (active, expires_at);