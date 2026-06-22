// 本地配置与缓存：保存在 app.getPath('userData') 下，纯 JSON，不依赖第三方库。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  apiKey: '',
  refreshInterval: 60,   // 秒：30 / 60 / 120 / 300
  widgetEnabled: false,
  autoLaunch: false
};

function file(name) {
  return path.join(app.getPath('userData'), name);
}

function readJSON(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(name, data) {
  try {
    fs.writeFileSync(file(name), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('写入失败', name, e);
  }
}

const Store = {
  getConfig() {
    return Object.assign({}, DEFAULTS, readJSON('config.json', {}));
  },
  setConfig(patch) {
    const next = Object.assign(this.getConfig(), patch);
    writeJSON('config.json', next);
    return next;
  },
  // 最近一次成功的快照，用于重启后立即显示，避免白屏
  getCache() {
    return readJSON('cache.json', null);
  },
  setCache(snapshot) {
    writeJSON('cache.json', snapshot);
  },
  // 导入的用量记录（CSV/JSON 回退）
  getImportedUsage() {
    return readJSON('usage-import.json', null);
  },
  setImportedUsage(records) {
    writeJSON('usage-import.json', records);
  }
};

module.exports = Store;
