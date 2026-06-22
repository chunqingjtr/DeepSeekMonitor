const ICONS = {
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 007 4.5v.5a2.5 2.5 0 00-2 2.45A2.5 2.5 0 003.5 10 2.5 2.5 0 005 14.5 2.5 2.5 0 007 19a2.5 2.5 0 005 0V4.5A2.5 2.5 0 009.5 2z"/><path d="M14.5 2A2.5 2.5 0 0117 4.5v.5a2.5 2.5 0 012 2.45A2.5 2.5 0 0120.5 10 2.5 2.5 0 0119 14.5 2.5 2.5 0 0117 19a2.5 2.5 0 01-5 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
};

let state = null;

const money = (n) => '¥' + (Number(n) || 0).toFixed(2);
const $ = (s) => document.querySelector(s);

function render(s) {
  if (!s) { renderEmpty('正在加载…', false); return; }
  state = s;
  if (!s.hasApiKey) { renderEmpty('未配置 API Key', true); return; }
  renderMain(s);
}

function renderEmpty(msg, showBtn) {
  $('#main-content').innerHTML = `
    <div class="empty">
      <div class="big">${msg}</div>
      <div>请在设置中填入 DeepSeek API Key 以开始监控余额与用量。</div>
      ${showBtn ? '<button onclick="window.dsm.openSettings()">打开设置</button>' : ''}
    </div>`;
  showView('main');
}

function modelRow(key, m, totalCost) {
  const share = totalCost > 0 ? Math.max(4, Math.round((m.cost / totalCost) * 100)) : 0;
  return `
    <div class="model-row" data-model="${key}">
      <div class="model-top">
        <div class="model-icon ${m.meta.color}">${ICONS[m.meta.icon]}</div>
        <div class="model-meta">
          <div class="name">${m.meta.name}</div>
          <div class="sub">${m.totalTokensText} Tokens</div>
        </div>
        <div class="model-right">
          <span class="amt">${money(m.cost)}</span>
          <span class="chev">${ICONS.chev}</span>
        </div>
      </div>
      <div class="progress"><i class="${m.meta.color}" style="width:${share}%"></i></div>
    </div>`;
}

function renderMain(s) {
  const online = s.isAvailable
    ? '<span class="pill"><span class="dot"></span>在线</span>'
    : '<span class="pill off"><span class="dot"></span>不可用</span>';
  const totalCost = (s.models.flash.cost || 0) + (s.models.pro.cost || 0);
  const trendSum = (s.trend || []).reduce((a, p) => a + (p.totalTokens || 0), 0);
  const trendPoints = (s.trend || []).map(p => ({ label: p.label, value: p.totalTokens }));

  const chartBlock = (s.trend && s.trend.length) ? `
    <div class="chart-card">
      <div class="chart-head">
        <div class="t"><span class="ic">${ICONS.chart}</span>消耗趋势</div>
        <div class="total">总计 ${humanTokens(trendSum)}</div>
      </div>
      <div class="chart-wrap">${barChart(trendPoints, { width: 320, height: 120 })}</div>
    </div>` : '';

  const errBlock = s.error ? `<div class="err-banner">${s.error}</div>` : '';
  const noticeBlock = (!s.usageAvailable && s.notice) ? `<div class="notice">${s.notice}</div>` : '';
  const updated = s.lastUpdated ? `<div class="updated">更新于 ${new Date(s.lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>` : '';

  $('#main-content').innerHTML = `
    ${errBlock}
    <div class="section-head"><span class="label">账户余额</span>${online}</div>
    <div class="balance">${money(s.totalBalance)}</div>
    <div class="stat-row">
      <div class="stat"><div class="k">今日消耗</div><div class="v">${money(s.todayCost)}</div></div>
      <div class="stat"><div class="k">本月消耗</div><div class="v">${money(s.monthCost)}</div></div>
    </div>
    <div class="models">
      ${modelRow('flash', s.models.flash, totalCost)}
      ${modelRow('pro', s.models.pro, totalCost)}
    </div>
    ${noticeBlock}
    ${chartBlock}
    ${updated}`;

  document.querySelectorAll('.model-row').forEach(el => {
    el.addEventListener('click', () => renderDetail(el.dataset.model));
  });
  showView('main');
}

function renderDetail(key) {
  const m = state.models[key];
  if (!m) return;
  const daily = m.daily || [];
  const points = daily.map(p => ({ label: p.label, value: p.totalTokens }));
  const peak = Math.max(0, ...points.map(p => p.value));
  const range = daily.length ? `${daily[0].label} - ${daily[daily.length - 1].label}` : '';

  $('#detail-content').innerHTML = `
    <button class="back-btn" id="btn-back">${ICONS.back} 返回</button>
    <div class="detail-header">
      <div class="model-icon ${m.meta.color}">${ICONS[m.meta.icon]}</div>
      <div>
        <div class="name">${m.meta.name}</div>
        <div class="amt">${money(m.cost)}</div>
      </div>
    </div>
    <div class="metric-row">
      <div class="metric"><div class="k">API 请求次数</div><div class="v">${(m.requestCount || 0).toLocaleString('en-US')}</div></div>
      <div class="metric"><div class="k">Tokens</div><div class="v">${m.totalTokensText}</div></div>
    </div>
    <div class="chart-card">
      <div class="chart-head">
        <div class="t">按日 Token 消耗</div>
        <div class="total">${humanTokens(peak)}</div>
      </div>
      <div class="chart-sub">${range}</div>
      <div class="chart-wrap">${barChart(points, { width: 320, height: 210, labelValues: true, gap: 12 })}</div>
    </div>`;

  $('#btn-back').addEventListener('click', () => showView('main'));
  showView('detail');
}

function showView(which) {
  $('#view-main').classList.toggle('hidden', which !== 'main');
  $('#view-detail').classList.toggle('hidden', which !== 'detail');
}

// ---------- 事件 ----------
$('#btn-refresh').addEventListener('click', async () => {
  $('#btn-refresh').style.opacity = '0.4';
  await window.dsm.refresh();
  $('#btn-refresh').style.opacity = '1';
});
$('#btn-settings').addEventListener('click', () => window.dsm.openSettings());
$('#btn-close').addEventListener('click', () => window.dsm.hideWindow());

window.dsm.onUpdate((s) => render(s));
window.dsm.getDashboard().then(render);
