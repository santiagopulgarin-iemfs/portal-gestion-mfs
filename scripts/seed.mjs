// Carga supabase/seed/*.json en app_docs usando la service role key.
// Uso:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs
// (o poné las variables en .env.local; también se acepta VITE_SUPABASE_URL). Nunca se commitea.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const dir = join(root, "supabase", "seed");
const force = process.argv.includes("--force");

const rows = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  // tablero__principal.json -> "tablero/principal"
  .map((f) => ({
    key: f.replace(/\.json$/, "").replace("__", "/"),
    data: JSON.parse(readFileSync(join(dir, f), "utf8")),
    updated_by: "seed",
  }));

if (!force) {
  const { data: existing, error } = await supabase.from("app_docs").select("key").in("key", rows.map((r) => r.key));
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (existing.length) {
    console.error("Ya existen: " + existing.map((e) => e.key).join(", ") + ". Usá --force para sobrescribir.");
    process.exit(1);
  }
}

const { error } = await supabase.from("app_docs").upsert(rows, { onConflict: "key" });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log("OK: " + rows.map((r) => r.key).join(", "));
