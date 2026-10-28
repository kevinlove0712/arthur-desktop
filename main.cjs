const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, shell, dialog, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { states, clampBounds, cleanSettings, jitter, walkTarget, hourKey, hourlyDue } = require('./model.js');

const { initPreferences, saveConfig, formatMessage } = require('./preferences.cjs');
const { checkRelease } = require('./updates.cjs');

if (process.env.ARTHUR_TEST_DATA) app.setPath('userData', process.env.ARTHUR_TEST_DATA);
app.setName('Arthur');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settings;
try { settings = cleanSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); }
catch { settings = cleanSettings(); }
let win, tray, timer, settingsWindow, bubble, bubbleTimer;
let drag = null, menuOpen = false, ignored = false, walking = null, busy = false;
let customDirectory, messages, nextWalk = 0, lastHour = hourKey(new Date()), pendingReminder;
let checkingUpdate = false, quitting = false;

function loadPreferences() {
  const defaults = path.join(__dirname, '自定义');
  const portableRoot = process.platform === 'darwin' ? path.resolve(path.dirname(process.execPath), '../../..') : path.dirname(process.execPath);
  const portable = app.isPackaged ? path.join(portableRoot, '自定义') : defaults;
  const fallback = path.join(app.getPath('userData'), '自定义');
  customDirectory = process.env.ARTHUR_TEST_DATA ? fallback : portable;
  let notice = '';
  if (app.isPackaged && (!fs.existsSync(portable) || portableRoot === '/Applications' || portableRoot.includes('/AppTranslocation/'))) customDirectory = fallback;
  let result;
  try { result = initPreferences(customDirectory, defaults, settings); fs.accessSync(customDirectory, fs.constants.W_OK); }
  catch (error) {
    customDirectory = fallback;
    try { result = initPreferences(fallback, defaults, settings); }
    catch (fallbackError) { dialog.showErrorBox('无法读取自定义文件', fallbackError.message); app.quit(); return false; }
    notice = `安装目录无法读写，已改用：${fallback}。`;
  }
  if (!notice && app.isPackaged && customDirectory === fallback) notice = `当前自定义文件夹：${fallback}。可从右键菜单打开。`;
  settings = result.settings; messages = result.messages;
  if (result.errors.length) notice += `\n设置中有无效项目，已保留原值或使用默认值：\n${result.errors.join('\n')}`;
  if (notice && !process.env.ARTHUR_TEST_DATA) dialog.showMessageBox({ type: 'info', title: '亚瑟 · 自定义文件夹', message: notice });
  nextWalk = Date.now() + jitter(settings.walkSeconds);
  return true;
}

function stopWalking() {
  if (!walking) return;
  walking = null;
  win.webContents.send('pet:walk', null);
  save();
}
function scheduleWalk() { nextWalk = Date.now() + jitter(settings.walkSeconds); }
function movePet(now) {
  if (walking) {
    const t = Math.min(1, (now - walking.started) / walking.duration);
    win.setPosition(Math.round(walking.from.x + (walking.to.x - walking.from.x) * t), Math.round(walking.from.y + (walking.to.y - walking.from.y) * t));
    if (t === 1) { stopWalking(); scheduleWalk(); }
    return;
  }
  if (!settings.walking || drag || menuOpen || busy || bubble || now < nextWalk) return;
  const from = win.getBounds();
  const to = walkTarget(from, screen.getDisplayMatching(from).workArea, settings.walkRegion);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance < 5) { scheduleWalk(); return; }
  walking = { from, to, started: now, duration: Math.max(500, distance / (55 * settings.size) * 1000) };
  win.webContents.send('pet:walk', to.x >= from.x ? 'running-right' : 'running-left');
}

function showReminder(date) {
  stopWalking(); scheduleWalk();
  const options = ['waving', 'jumping', 'waiting', 'review', 'failed'];
  play(options[Math.floor(Math.random() * options.length)]);
  const text = formatMessage(messages[Math.floor(Math.random() * messages.length)], date);
  if (bubble) bubble.close();
  clearTimeout(bubbleTimer);
  const b = win.getBounds(), area = screen.getDisplayMatching(b).workArea;
  const width = Math.min(320, area.width), height = Math.min(70 + Math.ceil(text.length / 18) * 22, area.height);
  const bounds = clampBounds({ x: b.x + (b.width - width) / 2, y: b.y >= area.y + height ? b.y - height : b.y + b.height, width, height }, area);
  bubble = new BrowserWindow({ ...bounds, frame: false, transparent: true, resizable: false, show: false, focusable: false, skipTaskbar: true, alwaysOnTop: settings.top, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'reminder-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  bubble.setIgnoreMouseEvents(true);
  bubble.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  bubble.webContents.on('will-navigate', event => event.preventDefault());
  const shown = bubble;
  shown.webContents.once('did-finish-load', () => { if (!shown.isDestroyed()) { shown.webContents.send('reminder:text', text); shown.showInactive(); } });
  shown.on('closed', () => { if (bubble === shown) bubble = null; });
  shown.loadFile(path.join(__dirname, 'reminder.html'));
  bubbleTimer = setTimeout(() => { if (!shown.isDestroyed()) shown.close(); }, 12000);
}
function tickHour(date) {
  if (hourlyDue(lastHour, date) && settings.hourly) pendingReminder = date;
  lastHour = hourKey(date);
  if (pendingReminder && date - pendingReminder > 60000) pendingReminder = null;
  if (pendingReminder && !drag && !menuOpen) { const due = pendingReminder; pendingReminder = null; showReminder(due); }
}

function applySettings(value) {
  const next = cleanSettings({ ...settings, ...value, position: settings.position });
  try { saveConfig(customDirectory, next); }
  catch (error) { return { ok: false, error: `无法保存设置：${error.message}` }; }
  stopWalking();
  settings = next;
  resize(settings.size);
  win.setAlwaysOnTop(settings.top, 'floating');
  if (bubble) bubble.setAlwaysOnTop(settings.top, 'floating');
  if (!settings.hourly) { pendingReminder = null; if (bubble) bubble.close(); }
  scheduleWalk();
  return { ok: true, settings };
}
function changeSetting(value) {
  const result = applySettings(value);
  if (!result.ok) dialog.showErrorBox('亚瑟', result.error);
}
function openSettings() {
  stopWalking(); scheduleWalk();
  if (settingsWindow) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ width: 560, height: 760, minWidth: 500, minHeight: 500, title: '亚瑟 · 设置', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'settings-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', event => event.preventDefault());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}
async function checkUpdates() {
  if (checkingUpdate) return { message: '正在检查更新…' };
  checkingUpdate = true;
  try {
    const release = await checkRelease(app.getVersion(), process.platform, process.arch);
    if (!release) return { message: `当前版本 ${app.getVersion()}，没有发现更新版本。` };
    const result = await dialog.showMessageBox(settingsWindow || win, { type: 'info', title: '发现新版本',
      message: `亚瑟 ${release.version}${release.preview ? '（测试版）' : ''}`,
      detail: '当前免安装版需要手动更新。下载后退出亚瑟，解压替换应用，并保留“自定义”文件夹。' + (release.download ? '' : '\n该版本尚无当前平台安装包，可查看发布页面。'),
      buttons: [release.download ? '下载新版本' : '查看发布页面', '稍后'], defaultId: 0, cancelId: 1 });
    if (result.response === 0) await shell.openExternal(release.download || release.url);
    return { message: `发现 ${release.version}。下载后请保留自定义文件夹，手动替换应用。` };
  } catch (error) { return { message: `检查失败，请检查网络或稍后重试。${error.message}` }; }
  finally { checkingUpdate = false; }
}
async function menuUpdate() {
  const result = await checkUpdates();
  if (!quitting) dialog.showMessageBox(settingsWindow || win, { type: 'info', title: '检查更新', message: result.message });
}


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
function play(state) { stopWalking(); scheduleWalk(); if (states[state]) win.webContents.send('pet:action', state); }
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
  stopWalking(); scheduleWalk();
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
    { label: '大小', submenu: [50, 75, 100, 125, 150, 200].map(sizePercent => ({ label: `${sizePercent}%${sizePercent === 100 ? '（默认）' : ''}`, type: 'radio', checked: settings.sizePercent === sizePercent, click: () => changeSetting({ sizePercent }) })) },
    { label: '偶尔自己动一动', type: 'checkbox', checked: settings.spontaneous, click: item => changeSetting({ spontaneous: item.checked }) },
    { label: '在屏幕上走动', type: 'checkbox', checked: settings.walking, click: item => changeSetting({ walking: item.checked }) },
    { label: '整点提醒', type: 'checkbox', checked: settings.hourly, click: item => changeSetting({ hourly: item.checked }) },
    { label: '目光跟随鼠标', type: 'checkbox', checked: settings.follow, click: item => changeSetting({ follow: item.checked }) },
    { label: '保持在最上层', type: 'checkbox', checked: settings.top, click: item => changeSetting({ top: item.checked }) },
    { label: '设置…', click: openSettings },
    { label: '打开自定义文件夹', click: () => shell.openPath(customDirectory) },
    { label: '检查更新…', click: menuUpdate },
    { type: 'separator' },
    { label: '拖动移动 · 单击跳跃 · 双击挥爪', enabled: false },
    { label: '退出亚瑟', accelerator: 'CommandOrControl+Q', click: () => app.quit() }
  ];
}

function openMenu() {
  if (menuOpen) return;
  stopWalking(); scheduleWalk();
  drag = null; menuOpen = true; setInteractive(true);
  win.webContents.send('pet:drag', null);
  Menu.buildFromTemplate(menuTemplate()).popup({ window: win, callback: () => { menuOpen = false; } });
}

function finishDrag() {
  if (!drag) return;
  drag = null; win.webContents.send('pet:drag', null); save();
}

function registerIPC() {
  const fromSettings = event => settingsWindow && event.sender === settingsWindow.webContents && event.senderFrame === settingsWindow.webContents.mainFrame;
  ipcMain.handle('settings:get', event => fromSettings(event) ? { settings, directory: customDirectory, version: app.getVersion() } : null);
  ipcMain.handle('settings:save', (event, value) => fromSettings(event) && value && typeof value === 'object' ? applySettings(value) : { ok: false, error: '无效设置' });
  ipcMain.handle('settings:folder', async event => fromSettings(event) ? shell.openPath(customDirectory) : '无效请求');
  ipcMain.handle('settings:update', event => fromSettings(event) ? checkUpdates() : null);
  ipcMain.on('settings:preview', event => { if (fromSettings(event)) showReminder(new Date()); });
  const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  const validPoint = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) < 100000 && Math.abs(value.y) < 100000;
  ipcMain.on('pet:busy', (event, value) => { if (trusted(event) && typeof value === 'boolean') busy = value; });
  ipcMain.on('pet:ready', event => { if (trusted(event)) sync(); });
  ipcMain.on('pet:hit', (event, hit) => { if (trusted(event) && typeof hit === 'boolean') setInteractive(hit); });
  ipcMain.on('pet:menu', event => { if (trusted(event)) openMenu(); });
  ipcMain.on('pet:drag-start', (event, point) => {
    if (!trusted(event) || menuOpen || !validPoint(point)) return;
    stopWalking(); scheduleWalk();
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
  win.loadFile(path.join(__dirname, 'index.html'));
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon.resize({ width: 22, height: 22 }));
  tray.setToolTip('亚瑟 · 右键打开菜单');
  tray.on('click', openMenu); tray.on('right-click', openMenu);
  screen.on('display-removed', bringBack);
  screen.on('display-metrics-changed', () => {
    stopWalking(); scheduleWalk();
    const b = win.getBounds(); win.setBounds(clampBounds(b, screen.getDisplayMatching(b).workArea));
  });
  timer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    movePet(Date.now());
    tickHour(new Date());
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
    if (!loadPreferences()) return;
    createWindow();
    powerMonitor.on('resume', () => { stopWalking(); scheduleWalk(); lastHour = hourKey(new Date()); pendingReminder = null; win.webContents.send('pet:reset-timer'); });
    if (process.platform === 'darwin') app.dock.hide();
  });
  app.on('activate', () => { if (win) bringBack(); });
  app.on('before-quit', () => { quitting = true; clearInterval(timer); clearTimeout(bubbleTimer); save(); });
  app.on('window-all-closed', () => app.quit());
}
