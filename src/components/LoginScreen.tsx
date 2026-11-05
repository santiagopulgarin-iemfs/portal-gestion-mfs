import { useState } from "react";
import { GateShell } from "./GateShell";
import { GoogleButton } from "./GoogleButton";

type Props = {
  error?: string;
  /** Lanza el flujo OAuth (la lógica vive en App.tsx). Puede devolver `{ error }` de Supabase. */
  onSignIn: () => Promise<{ error?: { message: string } | null } | void>;
};

/** Error de OAuth que Supabase devuelve en la URL al volver del proveedor. */
function urlError(): string | undefined {
  const q = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
  return q.get("error_description") || q.get("error") ? "No se pudo completar el inicio de sesión con Google. Intentá de nuevo." : undefined;
}

export function LoginScreen({ error, onSignIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const go = async () => {
    setBusy(true);
    setLocalError(undefined);
    try {
      const res = await onSignIn();
      if (res && res.error) {
        setLocalError("No se pudo iniciar el acceso con Google. Intentá de nuevo en unos minutos.");
        setBusy(false);
      }
    } catch {
      setLocalError("No hay conexión con el servicio de acceso. Revisá tu internet e intentá de nuevo.");
      setBusy(false);
    }
  };

  const msg = localError ?? error ?? urlError();

  return (
    <GateShell>
      <h1 className="gate-title">Portal de Gestión</h1>
      <p className="gate-lead">
        Espacio de trabajo para proyectos, actividades, direcciones de grupo, cargas académicas y el plan operativo.
      </p>
      {msg && (
        <p className="gate-alert" role="alert">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M10 1.8 19 17.5H1L10 1.8Zm-1 5.7v5h2v-5H9Zm0 6.4v2h2v-2H9Z" />
          </svg>
          <span>{msg}</span>
        </p>
      )}
      <GoogleButton onClick={() => void go()} busy={busy} />
      <p className="gate-note">
        El acceso es solo para correos autorizados por la institución. Si tu cuenta no funciona, comunicate con la
        coordinación o con quien administra el portal.
      </p>
    </GateShell>
  );
}
