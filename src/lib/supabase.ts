import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost", key || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Role = "admin" | "editor" | "viewer";

/** Rol del usuario autenticado según allowed_emails (null = no autorizado). */
export async function fetchRole(): Promise<Role | null> {
  const { data, error } = await supabase.rpc("app_role");
  if (error) throw error;
  return (data as Role | null) ?? null;
}
