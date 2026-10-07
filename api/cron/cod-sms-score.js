import { createCodSmsCronHandler } from '../../server/cod-sms/cron.js';

// Supabase Cron invokes this with a Vault-held COD_SMS_SCHEDULER_SECRET and a persisted
// dispatchId. The recipient atomically claims the dispatch before scoring.
// It walks the full source table and
// scores every new/stale order; COD_SMS_AI_ENABLED still gates it exactly
// like the manual POST path.
export const maxDuration = 300;

export default createCodSmsCronHandler();

export { createCodSmsCronHandler };
