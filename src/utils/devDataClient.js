import { supabase } from './supabaseClient.js';
import { createDevDataClient } from './devDataCache.js';

export const { clearDevDataCache, peekDevResource, readDevResource, fetchDevApi } = createDevDataClient({ auth: supabase.auth });

// Discard successful and pending reads on session changes, including token rotation.
supabase.auth.onAuthStateChange(event => {
  if (event !== 'INITIAL_SESSION') clearDevDataCache();
});
