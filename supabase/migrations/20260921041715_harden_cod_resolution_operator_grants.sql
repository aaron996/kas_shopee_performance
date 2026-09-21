-- Forward-only hardening: Supabase may retain an explicit anon execute grant
-- for existing functions even after PUBLIC is revoked.
revoke all on function public.is_cod_resolution_operator() from public, anon, authenticated;
grant execute on function public.is_cod_resolution_operator() to authenticated;
