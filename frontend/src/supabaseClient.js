import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados — veja o .env.example"
  );
}

// Chave "anon": só consegue LER (as policies de RLS no Supabase não
// permitem escrita para esse papel). Toda escrita acontece através da
// API REST do backend, que usa a service_role key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
