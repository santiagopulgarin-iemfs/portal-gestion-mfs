// Genera versiones limpias del escudo (fondo transparente) a partir de public/escudo.jpg.
// Uso (una sola vez; sharp NO es dependencia del proyecto):
//   npm i --no-save sharp && node scripts/make-crest.mjs
// Salidas en public/: escudo.png, escudo.webp, favicon-64.png, apple-touch-icon.png
import sharp from "sharp";

const SRC = "public/escudo.jpg";
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (i) => i * 4;
const isWhite = (i) => data[px(i)] > 232 && data[px(i) + 1] > 232 && data[px(i) + 2] > 232;

// 1) Flood fill del fondo blanco desde los bordes (el aro verde oscuro lo contiene).
const bg = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (bg[i] || !isWhite(i)) return;
  bg[i] = 1;
  stack.push(i);
};
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
while (stack.length) {
  const i = stack.pop();
  const x = i % W, y = (i / W) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// 2) Borde suave: pixeles a <=2px del fondo se re-mezclan contra el verde del aro (alpha por luminancia).
const ring = [0x2f, 0x58, 0x24];
const lumRing = 0.299 * ring[0] + 0.587 * ring[1] + 0.114 * ring[2];
const out = Buffer.from(data);
const near = (x, y) => {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && bg[yy * W + xx]) return true;
    }
  return false;
};
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, p = px(i);
    if (bg[i]) { out[p + 3] = 0; continue; }
    if (near(x, y)) {
      const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      const a = Math.max(0, Math.min(1, (255 - lum) / (255 - lumRing)));
      out[p] = ring[0]; out[p + 1] = ring[1]; out[p + 2] = ring[2];
      out[p + 3] = Math.round(a * 255);
    }
    if (out[p + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
console.log("bbox", box);
const base = () => sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract(box);

await base().png({ compressionLevel: 9 }).toFile("public/escudo.png");
await base().webp({ quality: 92, alphaQuality: 100 }).toFile("public/escudo.webp");
const sq = (s, bgc) =>
  base().resize(s, s, { fit: "contain", background: bgc, kernel: "lanczos3" });
await sq(64, { r: 0, g: 0, b: 0, alpha: 0 }).png().toFile("public/favicon-64.png");
await sq(180, { r: 255, g: 255, b: 255, alpha: 1 }).flatten({ background: "#ffffff" }).png().toFile("public/apple-touch-icon.png");
