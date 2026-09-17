// Simple build script
const { build } = require('vite');
const path = require('path');

async function main() {
  const root = path.join(__dirname, 'client');
  console.log('Building...');
  try {
    await build({ root, build: { outDir: 'dist' } });
    console.log('DONE');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
}

main();
