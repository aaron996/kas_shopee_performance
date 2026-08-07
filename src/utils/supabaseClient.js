import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5anNpaHdnbnpjeXRib2p2b29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTQ4NzgsImV4cCI6MjEwMDA5MDg3OH0.aOVx64tho522fwmLjiz54wPbKZsf_x58ZHVwMsYD4-s';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
