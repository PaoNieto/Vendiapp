-- Rate limit por usuario para POST /api/generations.
--
-- POR QUÉ: cada llamada dispara al Director + N imágenes contra Gemini, o sea
-- PLATA REAL de Paolo, y hasta ahora la ruta no tenía ningún tope. A los que
-- pagan los frena el saldo de créditos, pero un usuario de la allowlist
-- (`unlimited_users`) puede pegarle en loop sin límite, igual que podría hacerlo
-- una sesión robada o un script. Sin esto, la única defensa era la factura.
--
-- POR QUÉ EN POSTGRES Y NO EN MEMORIA: Vercel serverless levanta una instancia
-- por request; un contador en RAM sería ficticio. Mismo criterio que ya se
-- documentó para el rate limit del checkout.
--
-- TOPES: deliberadamente HOLGADOS (30/hora, 100/día). No están para racionar el
-- uso legítimo —Paolo probando en un día intenso no llega ni cerca— sino para
-- cortar un bucle automatizado. Si alguna vez hay que apretarlos, se cambian los
-- defaults de la función sin tocar la app.

create table if not exists public.generation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists generation_attempts_user_time_idx
  on public.generation_attempts (user_id, created_at desc);

-- RLS prendida y SIN políticas: nadie llega por PostgREST. Sólo el service_role
-- (que salta RLS) vía la RPC de abajo.
alter table public.generation_attempts enable row level security;

create or replace function public.check_generation_rate_limit(
  p_user_id text,
  p_per_hour int default 30,
  p_per_day int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour int;
  v_day  int;
begin
  -- Higiene: la tabla es un contador, no un historial. Nos alcanza con 2 días.
  delete from public.generation_attempts
   where created_at < now() - interval '2 days';

  select count(*) into v_hour
    from public.generation_attempts
   where user_id = p_user_id
     and created_at > now() - interval '1 hour';

  select count(*) into v_day
    from public.generation_attempts
   where user_id = p_user_id
     and created_at > now() - interval '1 day';

  if v_hour >= p_per_hour or v_day >= p_per_day then
    return jsonb_build_object(
      'allowed', false,
      'per_hour', v_hour,
      'per_day', v_day,
      'limit_hour', p_per_hour,
      'limit_day', p_per_day
    );
  end if;

  -- Sólo contamos los intentos PERMITIDos: si ya está bloqueado, seguir
  -- insertando extendería el castigo cada vez que reintenta.
  insert into public.generation_attempts (user_id) values (p_user_id);

  return jsonb_build_object(
    'allowed', true,
    'per_hour', v_hour + 1,
    'per_day', v_day + 1,
    'limit_hour', p_per_hour,
    'limit_day', p_per_day
  );
end;
$$;

-- Mismo blindaje que las RPC de créditos: sólo service_role la puede invocar.
revoke execute on function public.check_generation_rate_limit(text, int, int)
  from public, anon, authenticated;
