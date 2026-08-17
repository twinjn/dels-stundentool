import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Supabase-Konfiguration fehlt. Bitte .env Datei anlegen (siehe .env.example)."
  );
}

export const supabase = createClient(url, anonKey);
