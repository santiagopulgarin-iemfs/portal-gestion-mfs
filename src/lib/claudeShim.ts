/**
 * Adaptador: implementa la API mínima de window.claude (db / user / downloads) que usaba el
 * artefacto, pero sobre Supabase (tabla app_docs) y descargas por Blob. Así la lógica original
 * del portal (src/legacy/portal.js) funciona sin modificaciones.
 */
import JSZip from "jszip";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, type Role } from "./supabase";

const POLL_MS = 8000;
let chanSeq = 0;

type Snap = { exists: boolean; data: () => unknown; metadata: { hasPendingWrites: boolean } };
type Row = { data: unknown; updated_at: string };

function docRef(path: string, email: string) {
  return {
    async set(data: unknown) {
      const { error } = await supabase
        .from("app_docs")
        .upsert({ key: path, data, updated_by: email }, { onConflict: "key" });
      if (error) {
        // El código original trata "invalid_argument" como "solo lectura".
        const denied = error.code === "42501" || /row-level security/i.test(error.message);
        throw { code: denied ? "invalid_argument" : "unavailable", message: error.message };
      }
    },
    onSnapshot(onNext: (s: Snap) => void, onError?: (e: unknown) => void) {
      let lastStamp: string | null | undefined;
      let stopped = false;
      const emit = (row: Row | null) => {
        const stamp = row ? row.updated_at : null;
        if (stamp === lastStamp) return;
        lastStamp = stamp;
        onNext({ exists: !!row, data: () => row?.data, metadata: { hasPendingWrites: false } });
      };
      const load = async (first: boolean) => {
        const { data, error } = await supabase
          .from("app_docs")
          .select("data,updated_at")
          .eq("key", path)
          .maybeSingle();
        if (stopped) return;
        if (error) {
          if (first && onError) onError(error);
          return;
        }
        emit(data as Row | null);
      };
      void load(true);
      const poll = setInterval(() => void load(false), POLL_MS);
      let channel: RealtimeChannel | null = null;
      try {
        // Nombre único por suscripción: evita reutilizar un canal ya suscrito.
        channel = supabase
          .channel("app_docs:" + path + ":" + ++chanSeq)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "app_docs", filter: "key=eq." + path },
            () => void load(false),
          )
          .subscribe((status) => {
            // Al (re)conectar se pudo perder algún evento: se relee el documento.
            if (status === "SUBSCRIBED") void load(false);
          });
      } catch {
        /* queda el polling */
      }
      // Refresco al volver a la pestaña o recuperar red (los timers se frenan en segundo plano).
      const refetch = () => {
        if (document.visibilityState !== "hidden") void load(false);
      };
      document.addEventListener("visibilitychange", refetch);
      window.addEventListener("online", refetch);
      window.addEventListener("focus", refetch);
      return () => {
        stopped = true;
        clearInterval(poll);
        document.removeEventListener("visibilitychange", refetch);
        window.removeEventListener("online", refetch);
        window.removeEventListener("focus", refetch);
        if (channel) void supabase.removeChannel(channel);
      };
    },
  };
}

export function installClaudeShim(role: Role, email: string) {
  const db = { doc: (p: string) => docRef(p, email) };
  const user = { can: async (perm: string) => (perm === "data.write" ? role !== "viewer" : true) };
  const downloads = {
    async save({ filename, data }: { filename: string; data: Blob }) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  };
  const caps: Record<string, unknown> = { db, user, downloads };
  const w = window as any;
  w.JSZip = JSZip;
  w.claude = { use: async (name: string) => caps[name] ?? null };
}
