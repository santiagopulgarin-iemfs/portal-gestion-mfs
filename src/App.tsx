import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, fetchRole, supabase, type Role } from "./lib/supabase";
import { Portal } from "./Portal";

type View =
  | { s: "loading" }
  | { s: "signedOut"; error?: string }
  | { s: "unauthorized"; email: string }
  | { s: "ready"; role: Role; email: string };

export function App() {
  const [view, setView] = useState<View>({ s: "loading" });

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const resolve = async (session: Session | null) => {
      if (!session) {
        if (alive) setView((v) => (v.s === "unauthorized" ? v : { s: "signedOut" }));
        return;
      }
      const email = session.user.email ?? "";
      try {
        const role = await fetchRole();
        if (!alive) return;
        if (!role) {
          setView({ s: "unauthorized", email });
          await supabase.auth.signOut();
        } else {
          setView((v) => (v.s === "ready" && v.email === email && v.role === role ? v : { s: "ready", role, email }));
        }
      } catch {
        if (alive) setView({ s: "signedOut", error: "No se pudo verificar tu acceso. Intentá de nuevo." });
      }
    };
    void supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === "SIGNED_OUT") {
        setView((v) => (v.s === "unauthorized" ? v : { s: "signedOut" }));
      } else if (ev === "SIGNED_IN") {
        // diferido: no llamar a Supabase dentro del callback de auth
        setTimeout(() => void resolve(session), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!configured)
    return (
      <Screen title="Configuración pendiente">
        Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Copiá{" "}
        <code>.env.example</code> a <code>.env</code>.
      </Screen>
    );

  if (view.s === "loading") return <Screen title="Cargando…" />;

  if (view.s === "unauthorized")
    return (
      <Screen title="No autorizado">
        La cuenta <b>{view.email}</b> no está habilitada para usar este portal. Pedile al administrador que la agregue
        y volvé a intentarlo con otra cuenta.
        <button className="btn" onClick={() => setView({ s: "signedOut" })}>
          Volver
        </button>
      </Screen>
    );

  if (view.s === "signedOut")
    return (
      <Screen title="Portal de Gestión I.E. Marco Fidel Suárez">
        Iniciá sesión con tu cuenta de Google autorizada.
        {view.error && <p className="err">{view.error}</p>}
        <button
          className="btn"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.origin },
            })
          }
        >
          Continuar con Google
        </button>
      </Screen>
    );

  return <Portal role={view.role} email={view.email} onSignOut={() => void supabase.auth.signOut()} />;
}

function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="gate">
      <img src="/escudo.jpg" alt="Escudo" width={88} height={88} />
      <h1>{title}</h1>
      <div className="gate-body">{children}</div>
    </main>
  );
}
