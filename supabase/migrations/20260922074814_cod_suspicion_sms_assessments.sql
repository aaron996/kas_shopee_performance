-- Server-only AI assessment state for COD SMS evidence.
--
-- Raw SMS remains in public.kas_cod_suspicion_sms_messages, which is not
-- readable by anon/authenticated. This table is also server-only because the
-- evidence column contains verbatim SMS excerpts. Browser access must go
-- through the authenticated API, which omits evidence for ordinary users.

create table if not exists public.cod_suspicion_sms_assessments (
  id uuid primary key default gen_random_uuid(),
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  driver_id text not null,
  order_code text not null,
  status text not null check (status in ('pending', 'scored', 'no_evidence', 'failed')),
  sms_score smallint,
  confidence text,
  detected_patterns jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  explanation text,
  rubric_version text not null,
  model text not null,
  model_called boolean not null default false,
  source_fingerprint text not null,
  scored_at timestamptz,
  error_code text,
  error_message text,
  run_token uuid,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cod_suspicion_sms_assessments_order_key_unique
    unique (suspicion_type, driver_id, order_code),
  constraint cod_suspicion_sms_assessments_score_range
    check (sms_score is null or sms_score between 0 and 9),
  constraint cod_suspicion_sms_assessments_confidence_values
    check (
      confidence is null
      or confidence in ('cao', 'trung_binh', 'thap', 'khong_co_bang_chung')
    ),
  constraint cod_suspicion_sms_assessments_patterns_array
    check (jsonb_typeof(detected_patterns) = 'array'),
  constraint cod_suspicion_sms_assessments_evidence_array
    check (jsonb_typeof(evidence) = 'array'),
  constraint cod_suspicion_sms_assessments_fingerprint_format
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint cod_suspicion_sms_assessments_attempt_count
    check (attempt_count >= 0),
  constraint cod_suspicion_sms_assessments_text_limits
    check (
      char_length(coalesce(explanation, '')) <= 4000
      and char_length(coalesce(error_code, '')) <= 100
      and char_length(coalesce(error_message, '')) <= 500
      and char_length(rubric_version) between 1 and 100
      and char_length(model) between 1 and 100
    ),
  constraint cod_suspicion_sms_assessments_status_shape
    check (
      (
        status = 'pending'
        and sms_score is null
        and confidence is null
        and detected_patterns = '[]'::jsonb
        and evidence = '[]'::jsonb
        and scored_at is null
        and error_code is null
        and error_message is null
        and run_token is not null
        and not model_called
      )
      or (
        status = 'scored'
        and sms_score between 1 and 9
        and confidence in ('cao', 'trung_binh', 'thap')
        and jsonb_array_length(detected_patterns) > 0
        and jsonb_array_length(evidence) > 0
        and explanation is not null
        and scored_at is not null
        and error_code is null
        and error_message is null
        and run_token is null
        and model_called
      )
      or (
        status = 'no_evidence'
        and sms_score = 0
        and confidence = 'khong_co_bang_chung'
        and detected_patterns = '[]'::jsonb
        and evidence = '[]'::jsonb
        and explanation is not null
        and scored_at is not null
        and error_code is null
        and error_message is null
        and run_token is null
      )
      or (
        status = 'failed'
        and sms_score is null
        and confidence is null
        and detected_patterns = '[]'::jsonb
        and evidence = '[]'::jsonb
        and scored_at is not null
        and error_code is not null
        and error_message is not null
        and run_token is null
        and model_called
      )
    )
);

create index if not exists idx_cod_suspicion_sms_assessments_status
  on public.cod_suspicion_sms_assessments (status, updated_at desc);

alter table public.cod_suspicion_sms_assessments enable row level security;
revoke all on table public.cod_suspicion_sms_assessments
  from public, anon, authenticated;
grant select, insert, update on table public.cod_suspicion_sms_assessments
  to service_role;

-- Atomically claim an order for one worker. A matching successful assessment
-- is returned with claimed=false, so unchanged inputs never call the model
-- again. A failed row also stays deduped until a Dev explicitly uses force;
-- stale pending rows can be reclaimed. SECURITY INVOKER keeps the
-- service_role boundary intact.
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
