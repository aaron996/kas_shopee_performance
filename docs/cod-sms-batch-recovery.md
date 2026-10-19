# COD SMS: batch interruption recovery

## Behavior

The automatic scheduler still creates one dispatch per Vietnam calendar day.
The first leased request freezes up to 10,000 eligible logical case keys and
the model/rubric/reasoning/token/timeout configuration. Later requests reuse
the same scoring run and process only unfinished keys. Source rows, SMS, and
the SQL suspicion score are not modified by queue maintenance.

Each request stops starting new orders before its 210-second processing
budget. It reserves the entire per-order model timeout before starting an
order; a six-minute lease prevents overlapping workers. The existing
five-minute Vercel maximum remains the final backstop. A one-minute Supabase
cron tick delivers the next slice. Lost HTTP requests are redelivered, and a
crashed worker becomes reclaimable when its lease expires. A fresh pending
assessment remains unfinished until the original 15-minute stale-claim
window permits recovery.

Run-item insertion transactionally updates the batch counters and acknowledges
the case. Unique run/case keys make delivery idempotent. If an assessment was
committed before its run item, the next request logs that result without
calling the model again. Successful slices retain the run as `running` until
all frozen cases have an outcome; it then becomes `completed` or `partial`
(finished with failed orders). Three consecutive infrastructure failures close
the run as failed. Pausing the schedule stops new claims and redispatches;
an in-flight slice can finish. Dispatches expire after 24 hours.

Manual runs share the progress counters and token handling. They stop safely
before the request limit and report `aborted`, with UI instructions to run
again for remaining orders. They do not silently hand work to the scheduler
after the operator closes the browser.

## Model output

The selected model and reasoning are preserved. Default `max_output_tokens`
increases from 1,200 to 8,192 and default per-order timeout from 30 to 60 seconds.
Environment overrides remain supported. Only an explicit API
`incomplete_details.reason=max_output_tokens` gets one retry at twice the
budget, capped at 16,384; both attempts share the same wall-clock deadline.
The maximum generated token budget for a default order with a retry is
8,192 + 16,384. Existing completed unchanged assessments remain deduplicated.

The error message distinguishes exhausted token budget, content filter, and
unknown unfinished response. Logs contain fixed reason codes and numeric
usage counters; neither model text nor raw SMS is logged by this path.

## Rollout order

1. Apply `20261019043033_cod_sms_resumable_batches.sql` before deploying the
   API. The migration creates the queue/RPCs/trigger, repairs historical stale
   summaries from run items, and installs `cod-sms-resume`. It does not replay
   historical scoring or reset assessment attempt counts. Legacy dispatch
   claims return false during the rollout gap so old workers cannot start
   the unbounded sweep against the new queue.
2. Deploy the matching API and frontend changes. The UI polls while a batch
   is running and labels `partial` as “Hoàn tất, có lỗi”. Keep the scheduler
   settings and model selection already chosen by the operator.
3. Confirm the repaired historical run is `aborted`, preserves its actual
   item counts, and shows `COD_SMS_RUN_INTERRUPTED`. `finished_at` on a repaired
   historical record means the time it was reconciled, not a claimed exact
   process termination time.
4. Use a small reviewed case selection to validate real scoring. The 19 Oct
   batch has eight failed orders and one stale pending order; `GYRXDT7D` has
   already reached the automatic five-attempt cap, so it requires an explicit
   exact-case retry rather than a blanket force over the snapshot. Do not
   reset successful results or zero out attempt counts.
5. Verify a scheduled dispatch keeps one run ID through multiple slices,
   stops issuing HTTP requests after terminal status, and that run counters
   equal the outcome counts in `cod_suspicion_sms_run_items`.

For rollback, pause the SMS schedule first. Keep the new schema/trigger and
disable the `cod-sms-resume` cron job; reverting only API code intentionally
cannot claim new chunks through the disabled legacy RPC. Restore a reviewed
compatible worker before re-enabling the schedule. No destructive schema
rollback or historical result deletion is needed.

## Verification boundaries

PostgreSQL behavior is tested locally with PGlite using real constraints,
roles/RLS, triggers, leases and RPC transactions. Only cron, Vault and pg_net
extension boundaries are stubbed. Unit tests cover interrupted scoring,
recovery after assessment commit, concurrent delivery, removed source keys,
token exhaustion/retry/timeout and authentication guards.

The IAB fixture uses synthetic API responses to check polling, error text,
counts and terminal status. Neither these checks nor the build prove real
pg_net delivery, deployed migrations, authenticated production UI, or actual
AI scores. No paid model calls or production writes are part of these checks.
