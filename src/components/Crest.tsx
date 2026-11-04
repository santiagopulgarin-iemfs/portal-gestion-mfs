type Props = { size?: number; className?: string };

/** Escudo institucional (PNG/WebP con fondo transparente, proporción 1:1 sin deformar). */
export function Crest({ size = 160, className }: Props) {
  return (
    <picture className={className}>
      <source srcSet="/escudo.webp" type="image/webp" />
      <img
        src="/escudo.png"
        alt="Escudo de la Institución Educativa Marco Fidel Suárez"
        width={size}
        height={size}
        decoding="async"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    </picture>
  );
}
