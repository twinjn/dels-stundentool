import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Ist die .env vorhanden und ausgefüllt? Die App zeigt sonst einen Hinweis. */
export const supabaseKonfiguriert = Boolean(url && anonKey);

if (!supabaseKonfiguriert) {
  console.error(
    "Supabase-Konfiguration fehlt. Bitte .env Datei anlegen (siehe .env.example)."
  );
}

// Ohne Konfiguration wuerde createClient hier eine Ausnahme werfen und die
// Seite bliebe weiss, ohne jeden Hinweis. Deshalb Platzhalter -- die App
// prueft supabaseKonfiguriert und stellt gar nie eine Anfrage.
export const supabase = createClient(
  url || "http://localhost",
  anonKey || "nicht-konfiguriert"
);
