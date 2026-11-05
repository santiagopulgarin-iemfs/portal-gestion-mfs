// El JPG original del escudo viene recortado: el aro verde oval se sale del lienzo por arriba y por abajo (~83px).
// Este script cierra el óvalo (aro verde + interior blanco) sobre un lienzo más alto, a partir de public/escudo.png ya recortado.
// Uso (una sola vez, tras make-crest.mjs): npm i --no-save sharp && node scripts/complete-crest.mjs
// Geometría medida sobre el escudo de 553px de ancho: óvalo exterior rx=277, ry=368; interior rx=216.5, ry=308; centro y=285.
import sharp from "sharp";

const SRC = "public/escudo.png";
const meta = await sharp(SRC).metadata();
const W = meta.width, H = meta.height;
const PAD = 83; // filas añadidas arriba (abajo el óvalo llega a y=285+368=653, ~99 más allá del lienzo original)
const OH = PAD + 285 + 368; // alto del lienzo (736)
const cx = W / 2, cy = 285 + PAD;
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${OH}" viewBox="0 0 ${W} ${OH}">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="277" ry="368" fill="#2f5824"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="216.5" ry="308" fill="#ffffff"/></svg>`
);
const full = await sharp({ create: { width: W, height: OH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: svg }, { input: SRC, top: PAD, left: 0 }])
  .png().toBuffer();

await sharp(full).png({ compressionLevel: 9 }).toFile("public/escudo.png");
await sharp(full).webp({ quality: 92, alphaQuality: 100 }).toFile("public/escudo.webp");
const sq = (s, bg) => sharp(full).resize(s, s, { fit: "contain", background: bg, kernel: "lanczos3" });
await sq(64, { r: 0, g: 0, b: 0, alpha: 0 }).png().toFile("public/favicon-64.png");
await sq(180, { r: 255, g: 255, b: 255, alpha: 1 }).flatten({ background: "#ffffff" }).png().toFile("public/apple-touch-icon.png");
console.log("ok", W, OH);
