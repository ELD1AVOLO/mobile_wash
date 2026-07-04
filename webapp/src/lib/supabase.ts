import { createClient } from "@supabase/supabase-js";

/**
 * Direct Supabase client — the app talks to the database itself,
 * no web server in between. The publishable (anon) key is safe to
 * ship in the app: Row Level Security decides what it can touch.
 */
const SUPABASE_URL = "https://pdoufyhzkzjzpyxfsfcq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_80psA5lr4BsYmKi6fAPgng_iPbuiIcW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
