import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  console.log('Building...');
  try {
    await build({ root: __dirname, build: { outDir: 'dist' } });
    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
}

main();
