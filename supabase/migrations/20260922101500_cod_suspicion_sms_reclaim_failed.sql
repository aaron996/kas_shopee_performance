-- The original claim RPC deliberately never reclaimed a `failed` row without
-- an explicit p_force=true, to guard against silently re-billing OpenAI every
-- day for an order stuck on a systematically broken case. That protection
-- backfired once the root cause turned out to be a genuinely broken JSON
-- schema (see 2026-09-22 incident: 100% of real model calls failed with
-- `uniqueItems` rejected by OpenAI Structured Outputs) — the daily cron and
-- the manual run button could never retry any of it without a human running
-- an explicit force call.
--
-- This migration lets a `failed` row be reclaimed on the next claim like any
-- other stale case, but caps it at 5 attempts so a still-broken case (config
-- error, permanently malformed source data, etc.) cannot retry forever and
-- quietly keep spending OpenAI budget. Once attempt_count reaches 5, only an
-- explicit p_force=true retry (or a rubric/model bump) can reclaim it again.
create or replace function public.claim_cod_suspicion_sms_assessment(
  p_suspicion_type text,
  p_driver_id text,
  p_order_code text,
  p_source_fingerprint text,
  p_rubric_version text,
  p_model text,
  p_force boolean default false,
  p_stale_after_seconds integer default 900
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', current_user::text, '');
  v_row public.cod_suspicion_sms_assessments;
  v_claimed boolean := false;
  v_run_token uuid := gen_random_uuid();
begin
  if v_role <> 'service_role' then
    raise exception 'COD_SMS_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_suspicion_type not in ('Gối đầu COD', 'Rút ruột')
    or nullif(btrim(p_driver_id), '') is null
    or nullif(btrim(p_order_code), '') is null
    or p_source_fingerprint is null
    or p_source_fingerprint !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_rubric_version), '') is null
    or nullif(btrim(p_model), '') is null
    or p_stale_after_seconds is null
    or p_stale_after_seconds < 60
    or p_stale_after_seconds > 86400 then
    raise exception 'COD_SMS_CLAIM_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.kas_cod_suspicion_data source_order
    where source_order.suspicion_type = p_suspicion_type
      and source_order.driver_id = btrim(p_driver_id)
      and source_order.order_code = btrim(p_order_code)
  ) then
    raise exception 'COD_SMS_SOURCE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.cod_suspicion_sms_assessments (
    suspicion_type,
    driver_id,
    order_code,
    status,
    rubric_version,
    model,
    source_fingerprint,
    run_token,
    attempt_count,
    updated_at
  ) values (
    p_suspicion_type,
    btrim(p_driver_id),
    btrim(p_order_code),
    'pending',
    btrim(p_rubric_version),
    btrim(p_model),
    p_source_fingerprint,
    v_run_token,
    1,
    now()
  )
  on conflict (suspicion_type, driver_id, order_code) do update
    set status = 'pending',
        sms_score = null,
        confidence = null,
        detected_patterns = '[]'::jsonb,
        evidence = '[]'::jsonb,
        explanation = null,
        rubric_version = excluded.rubric_version,
        model = excluded.model,
        model_called = false,
        source_fingerprint = excluded.source_fingerprint,
        scored_at = null,
        error_code = null,
        error_message = null,
        run_token = v_run_token,
        attempt_count = public.cod_suspicion_sms_assessments.attempt_count + 1,
        updated_at = now()
    where coalesce(p_force, false)
      or public.cod_suspicion_sms_assessments.source_fingerprint is distinct from excluded.source_fingerprint
      or public.cod_suspicion_sms_assessments.rubric_version is distinct from excluded.rubric_version
      or public.cod_suspicion_sms_assessments.model is distinct from excluded.model
      or (
        public.cod_suspicion_sms_assessments.status = 'pending'
        and public.cod_suspicion_sms_assessments.updated_at
          < now() - make_interval(secs => p_stale_after_seconds)
      )
      or (
        public.cod_suspicion_sms_assessments.status = 'failed'
        and public.cod_suspicion_sms_assessments.attempt_count < 5
      )
  returning * into v_row;

  if found then
    v_claimed := true;
  else
    select * into strict v_row
    from public.cod_suspicion_sms_assessments
    where suspicion_type = p_suspicion_type
      and driver_id = btrim(p_driver_id)
      and order_code = btrim(p_order_code);
  end if;

  return jsonb_build_object(
    'claimed', v_claimed,
    'run_token', case when v_claimed then v_run_token else null end,
    'assessment', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.claim_cod_suspicion_sms_assessment(
  text, text, text, text, text, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.claim_cod_suspicion_sms_assessment(
  text, text, text, text, text, text, boolean, integer
) to service_role;
