const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { states, clampBounds, cleanSettings } = require('./model.js');

if (process.env.ARTHUR_TEST_DATA) app.setPath('userData', process.env.ARTHUR_TEST_DATA);
app.setName('Arthur');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settings;
try { settings = cleanSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); }
catch { settings = cleanSettings(); }
let win, tray, timer, drag = null, menuOpen = false, ignored = false;

function save() {
  if (win && !win.isDestroyed()) {
    const { x, y } = win.getBounds();
    settings.position = { x, y };
  }
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) { console.error('Could not save settings:', error.message); }
}

function sync() { win.webContents.send('pet:settings', settings); }
function play(state) { if (states[state]) win.webContents.send('pet:action', state); }
function setInteractive(value) {
  const next = !value && !drag && !menuOpen;
  if (ignored !== next) {
    ignored = next;
    win.setIgnoreMouseEvents(next, { forward: true });
  }
}

function resize(size) {
  const old = win.getBounds();
  settings.size = size;
  const width = Math.round(192 * size), height = Math.round(208 * size);
  const proposed = { x: old.x + (old.width - width) / 2, y: old.y + old.height - height, width, height };
  win.setBounds(clampBounds(proposed, screen.getDisplayMatching(old).workArea));
  sync(); save();
}

function bringBack() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const { width, height } = win.getBounds();
  win.setBounds(clampBounds({ x: area.x + area.width - width - 32, y: area.y + area.height - height - 16, width, height }, area));
  win.showInactive(); play('waving'); save();
}

function menuTemplate() {
  return [
    { label: '亚瑟 · 桌面小宠物', enabled: false },
    { label: '把亚瑟叫回来', click: bringBack },
    { type: 'separator' },
    { label: '互动', submenu: Object.entries(states).filter(([id]) => !id.startsWith('running-')).map(([id, spec]) => ({ label: spec.label, click: () => play(id) })) },
    { label: '大小', submenu: [[0.8, '迷你'], [1, '原始大小'], [1.25, '标准'], [1.5, '大一点']].map(([size, label]) => ({ label, type: 'radio', checked: settings.size === size, click: () => resize(size) })) },
    { label: '偶尔自己动一动', type: 'checkbox', checked: settings.spontaneous, click: item => { settings.spontaneous = item.checked; sync(); save(); } },
    { label: '目光跟随鼠标', type: 'checkbox', checked: settings.follow, click: item => { settings.follow = item.checked; sync(); save(); } },
    { label: '保持在最上层', type: 'checkbox', checked: settings.top, click: item => { settings.top = item.checked; win.setAlwaysOnTop(item.checked, 'floating'); save(); } },
    { type: 'separator' },
    { label: '拖动移动 · 单击跳跃 · 双击挥爪', enabled: false },
    { label: '退出亚瑟', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
  ];
}

function openMenu() {
  if (menuOpen) return;
  drag = null; menuOpen = true; setInteractive(true);
  win.webContents.send('pet:drag', null);
  Menu.buildFromTemplate(menuTemplate()).popup({ window: win, callback: () => { menuOpen = false; } });
}

function finishDrag() {
  if (!drag) return;
  drag = null; win.webContents.send('pet:drag', null); save();
}

function registerIPC() {
  const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  const validPoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) < 100000 && Math.abs(value.y) < 100000;
  ipcMain.on('pet:ready', event => { if (trusted(event)) sync(); });
  ipcMain.on('pet:hit', (event, hit) => { if (trusted(event) && typeof hit === 'boolean') setInteractive(hit); });
  ipcMain.on('pet:menu', event => { if (trusted(event)) openMenu(); });
  ipcMain.on('pet:drag-start', (event, point) => {
    if (!trusted(event) || menuOpen || !validPoint(point)) return;
    drag = { cursor: point, bounds: win.getBounds() };
    setInteractive(true);
  });
  ipcMain.on('pet:drag-move', (event, point) => {
    if (!trusted(event) || !drag || !validPoint(point)) return;
    const dx = point.x - drag.cursor.x, dy = point.y - drag.cursor.y;
    if (Math.hypot(dx, dy) <= 4) return;
    const b = clampBounds({ ...drag.bounds, x: drag.bounds.x + dx, y: drag.bounds.y + dy }, screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) }).workArea);
    const previous = win.getBounds();
    win.setBounds(b);
    win.webContents.send('pet:drag', b.x >= previous.x ? 'running-right' : 'running-left');
  });
  ipcMain.on('pet:drag-end', event => { if (trusted(event)) finishDrag(); });
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(192 * settings.size), height = Math.round(208 * settings.size);
  const position = settings.position || { x: area.x + area.width - width - 32, y: area.y + area.height - height - 16 };
  const proposed = { ...position, width, height };
  const bounds = clampBounds(proposed, screen.getDisplayMatching(proposed).workArea);
  win = new BrowserWindow({
    ...bounds, title: '亚瑟', frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
    alwaysOnTop: settings.top, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(settings.top, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.on('blur', finishDrag);
  registerIPC();
  win.once('ready-to-show', () => win.showInactive());
  win.loadFile('index.html');
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon.resize({ width: 22, height: 22 }));
  tray.setToolTip('亚瑟 · 右键打开菜单');
  tray.on('click', openMenu); tray.on('right-click', openMenu);
  screen.on('display-removed', bringBack);
  screen.on('display-metrics-changed', () => {
    const b = win.getBounds(); win.setBounds(clampBounds(b, screen.getDisplayMatching(b).workArea));
  });
  timer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('pet:pointer', { x: (point.x - b.x) / settings.size, y: (point.y - b.y) / settings.size });
  }, 50);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) bringBack(); });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    if (process.platform === 'darwin') app.dock.hide();
  });
  app.on('activate', () => { if (win) bringBack(); });
  app.on('before-quit', () => { clearInterval(timer); save(); });
  app.on('window-all-closed', () => app.quit());
}
