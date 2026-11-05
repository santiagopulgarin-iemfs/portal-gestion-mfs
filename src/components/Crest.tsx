/** Proporción ancho/alto del escudo completo (554x736). */
const RATIO = 554 / 736;

type Props = { size?: number; className?: string };

/** Escudo institucional (PNG/WebP con fondo transparente, óvalo completo 554x736: se dimensiona por el alto y el ancho sale de la proporción). */
export function Crest({ size = 160, className }: Props) {
  return (
    <picture className={className}>
      <source srcSet="/escudo.webp" type="image/webp" />
      <img
        src="/escudo.png"
        alt="Escudo de la Institución Educativa Marco Fidel Suárez"
        width={Math.round(size * RATIO)}
        height={size}
        decoding="async"
        style={{ width: "auto", height: size, maxWidth: "100%", objectFit: "contain" }}
      />
    </picture>
  );
}
