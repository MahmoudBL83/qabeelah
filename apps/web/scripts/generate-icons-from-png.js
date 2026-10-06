import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Resolve paths robustly whether the script is run from repo root or from apps/web
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const webRoot = path.resolve(__dirname, '..');
const srcPng = path.join(webRoot, 'public', 'qabeela-logo.png');

if (!fs.existsSync(srcPng)) {
  console.error('Source PNG not found at', srcPng);
  console.error('Please place your provided PNG at apps/web/public/qabeela-logo.png and re-run this script.');
  process.exit(2);
}

const outPublic = path.join(webRoot, 'public');
const mobileAssets = path.join(repoRoot, 'apps', 'mobile', 'assets');
if (!fs.existsSync(mobileAssets)) fs.mkdirSync(mobileAssets, { recursive: true });

const sizes = [512, 192, 152, 128, 96, 72, 48, 32];

async function generate() {
  const tasks = sizes.map(async (size) => {
    const out = path.join(outPublic, `qabeela-logo-${size}.png`);
    await sharp(srcPng).resize(size, size, { fit: 'contain' }).png().toFile(out);
    return out;
  });

  // copy main PNG to mobile assets and icon
  await sharp(srcPng).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(mobileAssets, 'qabeela-logo.png'));
  await sharp(srcPng).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(mobileAssets, 'icon.png'));
  // produce a large splash (keeps aspect, centered)
  await sharp(srcPng).resize(1242, 2436, { fit: 'contain', background: { r: 251, g: 249, b: 244, alpha: 1 } }).png().toFile(path.join(mobileAssets, 'splash.png'));

  await Promise.all(tasks);
  console.log('Generated icons from PNG in', outPublic, 'and', mobileAssets);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
