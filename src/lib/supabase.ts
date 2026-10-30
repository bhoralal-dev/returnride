import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Production Supabase Project Credentials (Public Anon / Publishable Client Key)
const DEFAULT_SUPABASE_URL = 'https://yefaqlrczrbdumjuramb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_CjVkh6EEMX_y9jM7ryBdEA_QjHBYLK2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    supabaseUrl !== 'https://your-project-id.supabase.co' &&
    !supabaseKey.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
