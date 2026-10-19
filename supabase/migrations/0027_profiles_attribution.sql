-- 0027: de qué anuncio / campaña vino cada usuario.
--
-- La llena `ensureProfile()` (lib/auth/ensure-profile.ts) la primera vez que se
-- crea el perfil, a partir de la cookie `vendi_attr` que deja el proxy cuando
-- la persona llega con utm_* o fbclid. First-touch: no se pisa.
--
-- Nullable y sin default: los perfiles viejos quedan en null. El código tolera
-- que esta columna todavía no exista (el update falla en silencio y el
-- registro sigue), así que el orden deploy/migración no rompe nada.

alter table public.profiles
  add column if not exists attribution jsonb;

comment on column public.profiles.attribution is
  'utm_* / fbclid / landing_path / first_seen de la primera visita (first-touch).';
