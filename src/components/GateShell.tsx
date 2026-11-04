import type { ReactNode } from "react";
import { Crest } from "./Crest";

type Props = {
  /** Contenido de la tarjeta derecha (título, texto y acciones). */
  children: ReactNode;
  /** Muestra el bloque de identidad completo (login) o uno compacto (estados). */
  compact?: boolean;
};

/** Marco común de las pantallas previas al portal: franja verde/azul, identidad, tarjeta y pie. */
export function GateShell({ children, compact = false }: Props) {
  const year = new Date().getFullYear();
  return (
    <div className={"gate-page" + (compact ? " is-compact" : "")}>
      <div className="gate-band" aria-hidden="true" />
      <main className="gate-main" id="contenido">
        <section className="gate-id" aria-label="Identidad institucional">
          <svg className="gate-rings" viewBox="0 0 400 520" aria-hidden="true" focusable="false">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <ellipse cx="200" cy="260" rx="190" ry="250" />
              <ellipse cx="200" cy="260" rx="158" ry="208" />
              <ellipse cx="200" cy="260" rx="126" ry="166" />
            </g>
          </svg>
          <Crest size={compact ? 112 : 176} className="gate-crest" />
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
