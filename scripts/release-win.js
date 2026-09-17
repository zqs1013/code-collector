const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'Setup_win');
const cleanupDirs = [
  path.join(rootDir, 'runtime'),
  path.join(rootDir, 'build-assets'),
  path.join(outputDir, 'win-unpacked'),
];
const cleanupFiles = [
  path.join(outputDir, 'builder-debug.yml'),
];

function killLikelyLockingProcesses() {
  if (process.platform !== 'win32') return;
  const killCommands = [
    'taskkill /F /IM "CodeCollector*.exe"',
    'taskkill /F /IM "electron.exe"',
    'taskkill /F /IM "7za.exe"',
  ];
  for (const cmd of killCommands) {
    spawnSync(cmd, { cwd: rootDir, shell: true, stdio: 'ignore' });
  }
}

function removePathWithRetry(targetPath, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    } catch (_) {
      if (attempt === maxAttempts) return false;
      const waitUntil = Date.now() + 1200;
      while (Date.now() < waitUntil) {}
    }
  }
  return false;
}

function runPack() {
  killLikelyLockingProcesses();

  // Remove stale NSIS temp archives that can remain locked.
  if (fs.existsSync(outputDir)) {
    const staleFiles = fs.readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith('.nsis.7z'))
      .map((name) => path.join(outputDir, name));
    for (const filePath of staleFiles) {
      removePathWithRetry(filePath);
    }
    removePathWithRetry(path.join(outputDir, 'win-unpacked'));
  }

  const env = {
    ...process.env,
    ELECTRON_BUILDER_BINARIES_MIRROR:
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  };
  const portableOnly = process.argv.includes('--portable-only');
  const command = portableOnly
    ? 'npm run pack:win:portable'
    : 'npm run pack:win';
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(command, {
      cwd: rootDir,
      env,
      shell: true,
      stdio: 'inherit',
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status === 0) return;
    if (attempt < maxAttempts) {
      console.log(`[release] pack failed (attempt ${attempt}), retrying...`);
      const waitUntil = Date.now() + 4000;
      while (Date.now() < waitUntil) {
        // Busy-wait avoids extra async complexity in this small utility script.
      }
    } else {
      throw new Error(`pack:win failed with code ${String(result.status)}`);
    }
  }
}

function cleanupArtifacts() {
  for (const dirPath of cleanupDirs) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[cleanup] removed dir: ${dirPath}`);
    }
  }

  for (const filePath of cleanupFiles) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      console.log(`[cleanup] removed file: ${filePath}`);
    }
  }

  if (!fs.existsSync(outputDir)) return;
  const entries = fs.readdirSync(outputDir);
  for (const name of entries) {
    const fullPath = path.join(outputDir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) continue;

    const lowerName = name.toLowerCase();
    const isExe = lowerName.endsWith('.exe');
    const isGuide = name.toLowerCase().endsWith('.md');
    const isBlockMap = name.toLowerCase().endsWith('.blockmap');

    if (isBlockMap || (!isExe && !isGuide)) {
      fs.rmSync(fullPath, { force: true });
      console.log(`[cleanup] removed file: ${fullPath}`);
    }
  }
}

function main() {
  runPack();
  cleanupArtifacts();
  const portableOnly = process.argv.includes('--portable-only');
  if (portableOnly) {
    console.log('[release] done. kept portable exe + guides.');
  } else {
    console.log('[release] done. kept installer exe + portable exe + guides.');
  }
}

main();
