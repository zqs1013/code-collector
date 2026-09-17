const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { app, shell, dialog, Tray, Menu } = require('electron');

const DEFAULT_PORT = 3000;
let serverProcess = null;
let tray = null;
let startInProgress = false;

function notify(message, title = 'CodeCollector') {
  if (!tray || typeof tray.displayBalloon !== 'function') return;
  try {
    tray.displayBalloon({
      iconType: 'info',
      title,
      content: message,
    });
  } catch (_) {
    // 托盘通知失败时忽略，不影响主流程
  }
}

function getBackendRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function getNodeRuntime() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'runtime', 'node.exe');
  }
  return process.execPath;
}

function getDataDir() {
  return path.join(app.getPath('appData'), 'CodeCollector');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForServer(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await wait(500);
  }
  return false;
}

function getTrayIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'build-assets', 'icon.ico');
  }
  return path.join(__dirname, '..', 'build-assets', 'icon.ico');
}

function getServerUrl() {
  const port = String(process.env.PORT || DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

function createTray() {
  const iconPath = getTrayIconPath();
  tray = new Tray(iconPath);
  tray.setToolTip('CodeCollector');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '打开管理页面',
      click: () => {
        shell.openExternal(getServerUrl());
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]));
  tray.on('click', () => {
    shell.openExternal(getServerUrl());
  });
  notify('正在启动服务，首次启动可能需要 5-15 秒。');
}

async function ensureServerStarted() {
  if (startInProgress || serverProcess) return;
  startInProgress = true;

  const backendRoot = getBackendRoot();
  const serverEntry = path.join(backendRoot, 'server.js');
  const nodeRuntime = getNodeRuntime();
  const port = String(process.env.PORT || DEFAULT_PORT);
  const dataDir = getDataDir();

  serverProcess = spawn(nodeRuntime, [serverEntry], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: port,
      CODE_COLLECTOR_DATA_DIR: dataDir,
    },
    windowsHide: true,
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (!app.isQuitting && code !== 0) {
      dialog.showErrorBox('服务已退出', `本地服务异常退出，退出码: ${code ?? 'unknown'}`);
    }
  });

  const ready = await waitForServer(Number(port));
  startInProgress = false;
  if (!ready) {
    throw new Error('服务启动超时');
  }
  notify('服务已就绪，已为你打开管理页面。');
  await shell.openExternal(getServerUrl());
}

async function bootstrap() {
  createTray();
  try {
    await ensureServerStarted();
  } catch (error) {
    notify('启动失败，请检查端口占用或安全软件拦截。', 'CodeCollector 启动失败');
    dialog.showErrorBox('启动失败', `无法启动服务：${error.message}`);
  }
}

app.whenReady().then(bootstrap);

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  // 托盘模式下不自动退出，由托盘菜单触发退出。
});
