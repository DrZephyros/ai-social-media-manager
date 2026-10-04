create table if not exists public.generation_quota (
    reservation_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists generation_quota_user_created_at_idx
    on public.generation_quota (user_id, created_at);

alter table public.generation_quota enable row level security;
revoke all on table public.generation_quota from anon, authenticated;
grant select, insert, delete on table public.generation_quota to service_role;

create or replace function public.reserve_generation(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    generation_count integer;
    oldest_generation timestamptz;
    new_reservation uuid;
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

    select pg_catalog.count(*)::integer, pg_catalog.min(g.created_at)
      into generation_count, oldest_generation
      from public.generation_quota as g
     where g.user_id = p_user_id
       and g.created_at > pg_catalog.now() - interval '7 days';

    if generation_count >= 2 then
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'resetsAt', floor(extract(epoch from (oldest_generation + interval '7 days')) * 1000)::bigint
        );
    end if;

    insert into public.generation_quota (user_id)
    values (p_user_id)
    returning reservation_id into new_reservation;

    return pg_catalog.jsonb_build_object('allowed', true, 'reservationId', new_reservation);
end;
$$;

create or replace function public.release_generation(p_user_id uuid, p_reservation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.generation_quota
     where user_id = p_user_id
       and reservation_id = p_reservation_id;
$$;

revoke all on function public.reserve_generation(uuid) from public, anon, authenticated;
revoke all on function public.release_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_generation(uuid) to service_role;
grant execute on function public.release_generation(uuid, uuid) to service_role;
