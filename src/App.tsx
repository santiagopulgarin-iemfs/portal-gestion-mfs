import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, fetchRole, supabase, type Role } from "./lib/supabase";
import { Portal } from "./Portal";
import { GateShell } from "./components/GateShell";
import { LoginScreen } from "./components/LoginScreen";

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
      <StatusScreen title="Configuración pendiente">
        <p className="gate-lead">
          Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Copiá{" "}
          <code>.env.example</code> a <code>.env</code>.
        </p>
      </StatusScreen>
    );

  if (view.s === "loading")
    return (
      <StatusScreen title="Cargando…" busy>
        <p className="gate-lead">Verificando tu sesión.</p>
      </StatusScreen>
    );

  if (view.s === "unauthorized")
    return (
      <StatusScreen title="Esta cuenta no tiene acceso">
        <p className="gate-lead">
          La cuenta <b className="gate-email">{view.email}</b> no figura en la lista de usuarios habilitados para este
          portal.
        </p>
        <p className="gate-note gate-note--first">
          Para solicitar acceso, escribile a la coordinación o a quien administra el portal indicando este correo. Si
          ingresaste con una cuenta equivocada, cerrá sesión y probá con tu correo autorizado.
        </p>
        <button className="gate-btn" onClick={() => setView({ s: "signedOut" })}>
          Cerrar sesión
        </button>
      </StatusScreen>
    );

  if (view.s === "signedOut")
    return (
      <LoginScreen
        error={view.error}
        onSignIn={() =>
          supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin },
          })
        }
      />
    );

  return <Portal role={view.role} email={view.email} onSignOut={() => void supabase.auth.signOut()} />;
}

function StatusScreen({
  title,
  busy,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <GateShell compact>
      <h1 className="gate-title">{title}</h1>
      {busy && <span className="gate-spinner" role="status" aria-label="Cargando" />}
      {children}
    </GateShell>
  );
}
