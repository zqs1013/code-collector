const path = require('path');
const os = require('os');

function resolveBaseDir() {
  const overrideDir = process.env.CODE_COLLECTOR_DATA_DIR;
  if (overrideDir && overrideDir.trim()) {
    return path.resolve(overrideDir.trim());
  }
  return path.join(__dirname, '..');
}

function resolvePortableDataDir() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'CodeCollector');
}

module.exports = {
  resolveBaseDir,
  resolvePortableDataDir,
};
