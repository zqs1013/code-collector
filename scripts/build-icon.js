const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function run() {
  const root = path.join(__dirname, '..');
  const assetsDir = path.join(root, 'build-assets');
  const customPng = path.join(assetsDir, 'custom-icon.png');
  const sourceSvg = path.join(root, 'client', 'public', 'favicon.svg');
  const pngPath = path.join(assetsDir, 'icon-256.png');
  const icoPath = path.join(assetsDir, 'icon.ico');

  fs.mkdirSync(assetsDir, { recursive: true });
  const iconSource = fs.existsSync(customPng) ? customPng : sourceSvg;
  await sharp(iconSource)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(pngPath);

  const icoBuffer = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`[icon] generated: ${icoPath}`);
}

run().catch((error) => {
  console.error('[icon] failed:', error.message);
  process.exit(1);
});
