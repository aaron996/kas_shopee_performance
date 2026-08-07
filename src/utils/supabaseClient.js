import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzeWpobWl2bnF3ZWxsZXZwZHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTIwNDYsImV4cCI6MjA5NjIyODA0Nn0.xVTWWUor-d83x0AuWQgoh6T5kcxEdWQ1NCdIOMRjXNs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
