import { createCodSmsCronHandler } from '../../server/cod-sms/cron.js';

// Vercel Cron invokes this on schedule (see vercel.json) with an
// Authorization: Bearer <CRON_SECRET> header, automatically added by Vercel
// when the CRON_SECRET env var is set. It walks the full source table and
// scores every new/stale order; COD_SMS_AI_ENABLED still gates it exactly
// like the manual POST path.
export const maxDuration = 300;

export default createCodSmsCronHandler();

export { createCodSmsCronHandler };
