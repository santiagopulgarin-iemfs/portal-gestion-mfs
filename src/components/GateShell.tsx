import type { ReactNode } from "react";
import { Crest } from "./Crest";

type Props = {
  /** Contenido de la tarjeta derecha (título, texto y acciones). */
  children: ReactNode;
  /** Muestra el bloque de identidad completo (login) o uno compacto (estados). */
  compact?: boolean;
};

/** Marco común de las pantallas previas al portal: franja verde, identidad, tarjeta y pie. */
export function GateShell({ children, compact = false }: Props) {
  const year = new Date().getFullYear();
  return (
    <div className={"gate-page" + (compact ? " is-compact" : "")}>
      <div className="gate-band" aria-hidden="true" />
      <main className="gate-main" id="contenido">
        <section className="gate-id" aria-label="Identidad institucional">
          <Crest size={compact ? 128 : 208} className="gate-crest" />
          <p className="gate-inst">
            Institución Educativa
            <strong>Marco Fidel Suárez</strong>
          </p>
          <p className="gate-place">Andes · Antioquia · Colombia</p>
        </section>
        <section className="gate-card" aria-live="polite">
          {children}
        </section>
      </main>
      <footer className="gate-foot">
        <span>© {year} Institución Educativa Marco Fidel Suárez</span>
        <span>Andes, Antioquia</span>
      </footer>
    </div>
  );
}
