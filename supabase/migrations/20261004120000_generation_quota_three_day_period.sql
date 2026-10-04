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
       and g.created_at > pg_catalog.now() - interval '3 days';

    if generation_count >= 2 then
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'resetsAt', floor(extract(epoch from (oldest_generation + interval '3 days')) * 1000)::bigint
        );
    end if;

    insert into public.generation_quota (user_id)
    values (p_user_id)
    returning reservation_id into new_reservation;

    return pg_catalog.jsonb_build_object('allowed', true, 'reservationId', new_reservation);
end;
$$;

revoke all on function public.reserve_generation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_generation(uuid) to service_role;
