/**
 * Generates square PNG app icons from public/icon.svg for PWA / Play packaging.
 * Run: node scripts/gen-pwa-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "icon.svg");
const outDir = path.join(root, "public", "icons");

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error("Missing public/icon.svg");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const buf = fs.readFileSync(svgPath);
  for (const size of [192, 512]) {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(buf).resize(size, size).png().toFile(out);
    console.log("Wrote", path.relative(root, out));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
