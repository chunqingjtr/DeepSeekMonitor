const $ = (s) => document.querySelector(s);
let cfg = null;

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.color = ok ? 'var(--green)' : '#ff6961';
  if (msg) setTimeout(() => { if (t.textContent === msg) t.textContent = ''; }, 4000);
}

function setKeyState(text, cls) {
  const el = $('#key-state');
  el.textContent = text;
  el.className = cls || '';
}

function paintIntervals(sec) {
  document.querySelectorAll('#intervals button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.sec) === Number(sec));
  });
}

async function load() {
  cfg = await window.dsm.getSettings();
  $('#apikey').value = cfg.apiKey || '';
  $('#sw-widget').checked = !!cfg.widgetEnabled;
  $('#sw-autolaunch').checked = !!cfg.autoLaunch;
  paintIntervals(cfg.refreshInterval || 60);
  setKeyState(cfg.apiKey ? '已配置' : '未配置', cfg.apiKey ? 'ok' : '');
}

// 显示/隐藏 Key
$('#btn-eye').addEventListener('click', () => {
  const i = $('#apikey');
  i.type = i.type === 'password' ? 'text' : 'password';
});

// 验证并保存
$('#btn-save').addEventListener('click', async () => {
  const key = $('#apikey').value.trim();
  if (!key) { toast('请输入 API Key', false); return; }
  $('#btn-save').textContent = '验证中…';
  $('#btn-save').disabled = true;
  const r = await window.dsm.validateKey(key);
  $('#btn-save').textContent = '验证并保存';
  $('#btn-save').disabled = false;
  if (r.ok) {
    setKeyState('已配置', 'ok');
    toast(`验证成功，当前余额 ¥${(r.balance || 0).toFixed(2)}`, true);
  } else {
    setKeyState('验证失败', 'bad');
    toast(r.error || '验证失败', false);
  }
});

// 清除
$('#btn-clear').addEventListener('click', async () => {
  $('#apikey').value = '';
  await window.dsm.saveSettings({ apiKey: '' });
  setKeyState('未配置', '');
  toast('已清除 API Key', true);
});

// 小组件
$('#sw-widget').addEventListener('change', (e) => {
  window.dsm.saveSettings({ widgetEnabled: e.target.checked });
});

// 开机自启
$('#sw-autolaunch').addEventListener('change', (e) => {
  window.dsm.saveSettings({ autoLaunch: e.target.checked });
  toast(e.target.checked ? '已开启开机自启' : '已关闭开机自启', true);
});

// 刷新间隔
document.querySelectorAll('#intervals button').forEach(b => {
  b.addEventListener('click', () => {
    const sec = Number(b.dataset.sec);
    paintIntervals(sec);
    window.dsm.saveSettings({ refreshInterval: sec });
    toast(`刷新间隔已设为 ${b.textContent.trim()}`, true);
  });
});

// 导入
$('#btn-import').addEventListener('click', async () => {
  const r = await window.dsm.importUsage();
  if (r.canceled) return;
  if (r.ok) toast(`导入成功：${r.count} 条用量记录`, true);
  else toast(r.error || '导入失败', false);
});

$('#btn-close').addEventListener('click', () => window.dsm.closeWindow());

load();
