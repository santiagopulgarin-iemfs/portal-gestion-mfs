import { useEffect } from "react";
import html from "./legacy/portal.html?raw";
import { initPortal } from "./legacy/portal.js";
import { installClaudeShim } from "./lib/claudeShim";
import type { Role } from "./lib/supabase";

export function Portal({ role, email, onSignOut }: { role: Role; email: string; onSignOut: () => void }) {
  useEffect(() => {
    installClaudeShim(role, email);
    initPortal();
  }, [role, email]);

  return (
    <>
      <div className="session-bar">
        <span title={"Rol: " + role}>{email}</span>
        <button type="button" onClick={onSignOut}>
          Salir
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
