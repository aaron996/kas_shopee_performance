# COD SMS AI scoring pipeline

## Boundary and architecture

The pipeline is a server-only Vercel function at `POST /api/cod-sms-assessments`.
It authenticates the caller's Supabase JWT, verifies `is_dev_admin()` under that
JWT, then uses the server-only service client to read the restricted SMS table.
The browser never receives an OpenAI key, service-role key, or raw SMS input.

The assessment table is separate from `kas_cod_suspicion_data`; the pipeline
does not update `total_score`, source rows, or driver-resolution state. No cron
is configured by this change.

`GET /api/cod-sms-assessments` is the stable UI contract. Any authenticated app
user can request non-raw assessment fields. Only a Dev Admin can add
`include_evidence=true`; otherwise `evidence` is `null`. The underlying SMS and
assessment tables have no direct `anon`/`authenticated` grants.

## Environment

Keep the feature disabled until the migration has been reviewed and applied by
the approved production process:

```dotenv
COD_SMS_AI_ENABLED=true
COD_SMS_AI_MODEL=gpt-5.6-luna
COD_SMS_AI_REASONING_EFFORT=low
COD_SMS_AI_RUBRIC_VERSION=sms-rubric-2026-09-19-v1
COD_SMS_AI_BATCH_LIMIT=25
COD_SMS_AI_MAX_BATCH_LIMIT=200
COD_SMS_AI_MAX_OUTPUT_TOKENS=1200
COD_SMS_AI_MODEL_TIMEOUT_MS=30000
COD_SMS_AI_PENDING_STALE_SECONDS=900
```

The function reuses server-only `OPENAI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never use a `VITE_`
prefix for these values.

## Manual one-time batch

Run small pages so a serverless timeout cannot waste a large batch. Keep
`force=false`; a row whose fingerprint, rubric version, and model are unchanged
is returned as `skippedUnchanged` without another model call.

```powershell
$apiRoot = 'https://kas-shopee-performance.vercel.app'
$devJwt = '<authenticated Dev Admin access token>'
$headers = @{
  Authorization = "Bearer $devJwt"
  'Content-Type' = 'application/json'
}

0,25,50,75,100,125 | ForEach-Object {
  $body = @{ limit = 25; offset = $_; force = $false } | ConvertTo-Json
  Invoke-RestMethod `
    -Method Post `
    -Uri "$apiRoot/api/cod-sms-assessments" `
    -Headers $headers `
    -Body $body
}
```

For a narrowly reviewed retry, send exact logical keys instead of enabling
`force` for the whole snapshot:

```json
{
  "cases": [
    {
      "suspicionType": "Gối đầu COD",
      "driverId": "3100818",
      "orderCode": "GY8CFXTR"
    }
  ],
  "force": false
}
```

Use `force=true` only when an intentional re-score with identical input,
rubric, and model is worth the additional cost. Unchanged failed rows remain
deduped too; retry one by sending its exact logical key with `force=true`.
Only a stale pending claim is reclaimed automatically.

## Response contract v1

```json
{
  "contractVersion": "1",
  "assessments": [
    {
      "key": {
        "suspicionType": "Gối đầu COD",
        "driverId": "3100818",
        "orderCode": "GY8CFXTR"
      },
      "status": "scored",
      "smsScore": 6,
      "confidence": "cao",
      "detectedPatterns": ["mau_1", "mau_3"],
      "evidence": null,
      "evidenceRestricted": true,
      "explanation": "Có tín hiệu cần xác minh.",
      "rubricVersion": "sms-rubric-2026-09-19-v1",
      "model": "gpt-5.6-luna",
      "modelCalled": true,
      "sourceFingerprint": "<sha256>",
      "scoredAt": "2026-09-22T00:00:00.000Z",
      "technicalError": null,
      "attemptCount": 1,
      "updatedAt": "2026-09-22T00:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "evidenceIncluded": false
  }
}
```

Statuses are `pending | scored | no_evidence | failed`. `smsScore` is `null`
for pending/failed, `0` for no evidence, and `1..9` for scored. No-evidence is
not a fraud or non-fraud conclusion.

## Verification layers

Local checks:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

After the forward migration is applied through the approved management path,
verify schema/RLS separately:

```sql
select relrowsecurity
from pg_class
where oid = 'public.cod_suspicion_sms_assessments'::regclass;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'kas_cod_suspicion_sms_messages',
    'cod_suspicion_sms_assessments'
  )
order by table_name, grantee, privilege_type;

select p.proname, p.prosecdef,
       has_function_privilege(
         'authenticated',
         p.oid,
         'EXECUTE'
       ) as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_cod_suspicion_sms_assessment';
```

Expected: RLS is enabled; `anon` and `authenticated` have no table privileges;
the claim function has `prosecdef=false` and authenticated cannot execute it.

Production verification still requires an authenticated retest with both a
regular account and a Dev Admin account, plus a deliberately small paid batch.
Confirm that the regular account receives no evidence, the Dev account can run
and read evidence, a repeated unchanged case increments `skippedUnchanged`, and
`kas_cod_suspicion_data.total_score` and driver-resolution state remain
unchanged.
