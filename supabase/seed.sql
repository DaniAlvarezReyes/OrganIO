-- Datos SOLO para desarrollo local (`supabase db reset`). Nunca se aplican en producción.
-- Cambia el correo por el tuyo: es el único que podrá darse de alta mientras el
-- registro esté en modo «solo invitación».
insert into private.signup_allowlist (email) values ('daniel.alvarez.ava@gmail.com')
on conflict do nothing;
