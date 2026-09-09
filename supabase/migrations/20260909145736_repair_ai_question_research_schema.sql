-- Repair the question-research columns omitted from the production rollout.
-- All columns are nullable to preserve existing request rows.

alter table public.ai_chat_requests
  add column if not exists user_email text,
  add column if not exists question text,
  add column if not exists question_normalized text,
  add column if not exists question_fingerprint text,
  add column if not exists client_filter text,
  add column if not exists active_tab text;

create index if not exists idx_ai_chat_requests_email
  on public.ai_chat_requests (lower(user_email));

create index if not exists idx_ai_chat_requests_fingerprint
  on public.ai_chat_requests (question_fingerprint);

notify pgrst, 'reload schema';
