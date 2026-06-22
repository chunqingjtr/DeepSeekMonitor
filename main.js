const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const { buildDashboard } = require('./deepseek');

let tray = null;
let popup = null;       // 托盘弹出主面板
let settingsWin = null;
let refreshTimer = null;
let lastState = null;

const ICON = path.join(__dirname, 'assets', 'whale.png');

// 单实例
if (!app.requestSingleInstanceLock()) { app.quit(); }

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.deepseek.monitor');
  createTray();
  createPopup();
  scheduleRefresh();
  refresh(); // 启动即拉一次
});

app.on('window-all-closed', (e) => { /* 托盘常驻，不退出 */ });

// ---------- Tray ----------
function createTray() {
  let img = nativeImage.createFromPath(ICON);
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('DeepSeek Monitor');
  tray.on('click', togglePopup);
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: '刷新', click: () => refresh() },
      { label: '设置…', click: () => openSettings() },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ---------- Popup main panel ----------
function createPopup() {
  popup = new BrowserWindow({
    width: 356,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  popup.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  popup.on('blur', () => { if (popup && !popup.webContents.isDevToolsOpened()) popup.hide(); });
}

function positionPopup() {
  const { workArea } = screen.getPrimaryDisplay();
  const b = popup.getBounds();
  // 贴近右下角（任务栏托盘上方）
  const x = workArea.x + workArea.width - b.width - 12;
  const y = workArea.y + workArea.height - b.height - 12;
  popup.setPosition(Math.round(x), Math.round(y));
}

function togglePopup() {
  if (popup.isVisible()) { popup.hide(); return; }
  positionPopup();
  popup.show();
  popup.focus();
  popup.webContents.send('dashboard:update', lastState || Store.getCache());
  refresh();
}

// ---------- Settings ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 380,
    height: 600,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- Refresh ----------
function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const sec = Store.getConfig().refreshInterval || 60;
  refreshTimer = setInterval(refresh, Math.max(15, sec) * 1000);
}

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const cfg = Store.getConfig();
  try {
    const state = await buildDashboard({
      apiKey: cfg.apiKey,
      importedUsage: Store.getImportedUsage()
    });
    lastState = state;
    Store.setCache(state);
  } catch (e) {
    lastState = Object.assign({}, lastState || Store.getCache() || {}, {
      error: e.message || String(e),
      lastUpdated: Date.now()
    });
  } finally {
    refreshing = false;
    if (popup && popup.isVisible()) popup.webContents.send('dashboard:update', lastState);
    updateTrayTitle();
  }
}

function updateTrayTitle() {
  if (!tray || !lastState) return;
  const bal = typeof lastState.totalBalance === 'number' ? lastState.totalBalance.toFixed(2) : '--';
  tray.setToolTip(`DeepSeek Monitor — 余额 ¥${bal}`);
}

// ---------- IPC ----------
ipcMain.handle('dashboard:get', () => lastState || Store.getCache());
ipcMain.handle('dashboard:refresh', async () => { await refresh(); return lastState; });
ipcMain.handle('settings:get', () => Store.getConfig());
ipcMain.handle('settings:save', (e, patch) => {
  const next = Store.setConfig(patch);
  if ('refreshInterval' in patch) scheduleRefresh();
  if ('autoLaunch' in patch) {
    app.setLoginItemSettings({ openAtLogin: !!patch.autoLaunch, path: process.execPath });
  }
  refresh();
  return next;
});
ipcMain.handle('apikey:validate', async (e, apiKey) => {
  try {
    const state = await buildDashboard({ apiKey, importedUsage: Store.getImportedUsage() });
    Store.setConfig({ apiKey });
    lastState = state; Store.setCache(state);
    if (popup) popup.webContents.send('dashboard:update', state);
    return { ok: true, balance: state.totalBalance, currency: state.currency };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('usage:import', async () => {
  const res = await dialog.showOpenDialog(settingsWin, {
    title: '导入 DeepSeek 用量 CSV / JSON',
    filters: [{ name: '用量数据', extensions: ['csv', 'json'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  try {
    const records = parseUsageFile(res.filePaths[0]);
    Store.setImportedUsage(records);
    await refresh();
    return { ok: true, count: records.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.on('open-settings', () => openSettings());
ipcMain.on('window:hide', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.hide();
});
ipcMain.on('window:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.close();
});

// ---------- CSV/JSON 解析 ----------
function parseUsageFile(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  if (fp.toLowerCase().endsWith('.json')) {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : (j.data || []);
  }
  // CSV
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = splitCSV(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (names) => headers.findIndex(h => names.includes(h));
  const di = idx(['date', '日期']);
  const mi = idx(['model_name', 'model', '模型']);
  const ti = idx(['total_tokens', 'tokens', '总tokens', 'token']);
  const ci = idx(['cost_in_cents', 'cost', '费用', '消耗']);
  const ri = idx(['request_count', 'requests', '请求次数', '请求数']);
  const pi = idx(['prompt_tokens', 'input_tokens', '输入tokens']);
  const oi = idx(['completion_tokens', 'output_tokens', '输出tokens']);
  return lines.slice(1).map((line, k) => {
    const c = splitCSV(line);
    const num = (i) => { const v = i >= 0 ? parseFloat(String(c[i]).replace(/[, ]/g, '')) : 0; return isNaN(v) ? 0 : v; };
    let cost = num(ci);
    // 若像元（含小数点），转为分
    if (ci >= 0 && String(c[ci]).includes('.')) cost = Math.round(cost * 100);
    return {
      id: `import-${k}`,
      date: di >= 0 ? String(c[di]).trim().slice(0, 10) : '',
      model_name: mi >= 0 ? String(c[mi]).trim() : 'deepseek-chat',
      total_tokens: Math.round(num(ti)),
      prompt_tokens: Math.round(num(pi)),
      completion_tokens: Math.round(num(oi)),
      cost_in_cents: Math.round(cost),
      request_count: Math.round(num(ri))
    };
  }).filter(r => r.date);
}

function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}
