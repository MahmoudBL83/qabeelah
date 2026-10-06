import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = path.resolve('.', 'apps', 'web');
const svgPath = path.join(root, 'public', 'qabeela-mark.svg');

if (!fs.existsSync(svgPath)) {
  console.error('Source SVG not found at', svgPath);
  process.exit(2);
}

const outPublic = path.join(root, 'public');
const mobileAssets = path.resolve('.', 'apps', 'mobile', 'assets');
if (!fs.existsSync(mobileAssets)) fs.mkdirSync(mobileAssets, { recursive: true });

const sizes = [512, 192, 152, 128, 96, 72, 48, 32];

async function generate() {
  const tasks = sizes.map(async (size) => {
    const out = path.join(outPublic, `qabeela-logo-${size}.png`);
    await sharp(svgPath).resize(size, size, { fit: 'contain' }).png().toFile(out);
    // also copy a main named variant for convenience
    if (size === 512) {
      await sharp(svgPath).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(outPublic, 'qabeela-logo.png'));
      await sharp(svgPath).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(mobileAssets, 'qabeela-logo.png'));
      await sharp(svgPath).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(mobileAssets, 'icon.png'));
    }
    return out;
  });

  // generate splash (large)
  const splashOut = path.join(mobileAssets, 'splash.png');
  await sharp(svgPath).resize(1242, 2436, { fit: 'contain', background: { r: 251, g: 249, b: 244, alpha: 1 } }).png().toFile(splashOut);

  await Promise.all(tasks);
  console.log('Generated icons in', outPublic, 'and', mobileAssets);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
