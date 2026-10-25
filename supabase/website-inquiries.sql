-- Dedicated website table. Existing open-platform tables are untouched.
create table public.hillstreet_website_inquiries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  company text not null default '' check (length(company) <= 200),
  message text not null check (length(btrim(message)) between 1 and 5000),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$')
);
create index hillstreet_website_inquiries_rate_idx on public.hillstreet_website_inquiries (ip_hash, created_at);
alter table public.hillstreet_website_inquiries enable row level security;
revoke all on public.hillstreet_website_inquiries from public, anon, authenticated;
grant select, insert, delete on public.hillstreet_website_inquiries to service_role;

create function public.submit_hillstreet_website_inquiry(
  p_request_id uuid, p_name text, p_email text, p_company text, p_message text, p_ip_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 0));
  if exists (select 1 from public.hillstreet_website_inquiries where request_id = p_request_id and ip_hash = p_ip_hash) then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.hillstreet_website_inquiries where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= 3 then
    return jsonb_build_object('rate_limited', true);
  end if;
  insert into public.hillstreet_website_inquiries(request_id,name,email,company,message,ip_hash)
  values (p_request_id,btrim(p_name),lower(btrim(p_email)),btrim(coalesce(p_company,'')),btrim(p_message),p_ip_hash);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.submit_hillstreet_website_inquiry(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_hillstreet_website_inquiry(uuid,text,text,text,text,text) to service_role;
