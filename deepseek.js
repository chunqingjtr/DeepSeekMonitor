// DeepSeek API 服务 + 聚合逻辑。
// 复刻自 macOS 版的 DeepSeekService / DashboardViewModel：
//   GET https://api.deepseek.com/user/balance   → 账户余额
//   GET https://api.deepseek.com/v1/usage        → Token 用量（官方常返回 404，自动回退）
const BASE = 'https://api.deepseek.com';

// 模型映射：API model_name → 展示
const MODELS = {
  flash: { key: 'flash', api: 'deepseek-chat',     name: 'V4 Flash', icon: 'bolt',  color: 'flash' },
  pro:   { key: 'pro',   api: 'deepseek-reasoner',  name: 'V4 Pro',   icon: 'brain', color: 'pro'   }
};

function modelKeyFor(apiName) {
  const n = (apiName || '').toLowerCase();
  if (n.includes('reason') || n.includes('pro')) return 'pro';
  return 'flash';
}

async function apiGet(path, apiKey, query) {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (res.status === 401) throw new ApiError('unauthorized', 'API Key 无效或已过期');
  if (res.status === 429) throw new ApiError('rateLimited', '请求过于频繁，请稍后重试');
  if (res.status === 404) throw new ApiError('notFound', 'not found');
  if (res.status >= 500) throw new ApiError('serverError', `服务器错误 (${res.status})`);
  if (!res.ok) throw new ApiError('httpError', `HTTP 错误 (${res.status})`);
  return res.json();
}

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function preferredBalance(infos) {
  if (!infos || !infos.length) return null;
  const cny = infos.find(i => (i.currency || '').toUpperCase() === 'CNY');
  if (cny) return cny;
  const nonZero = infos.find(i => parseFloat(i.total_balance) > 0);
  return nonZero || infos[0];
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// 聚合用量记录 → 仪表盘所需结构
function aggregate(records) {
  const today = ymd(new Date());
  const month = today.slice(0, 7);

  let todayCost = 0, monthCost = 0;
  const byModel = {
    flash: { totalTokens: 0, costInCents: 0, requestCount: 0, days: {} },
    pro:   { totalTokens: 0, costInCents: 0, requestCount: 0, days: {} }
  };

  for (const r of records) {
    const cost = r.cost_in_cents || 0;
    if (r.date === today) todayCost += cost;
    if ((r.date || '').startsWith(month)) monthCost += cost;

    const mk = modelKeyFor(r.model_name);
    const m = byModel[mk];
    m.totalTokens += r.total_tokens || 0;
    m.costInCents += cost;
    m.requestCount += r.request_count || 0;
    const d = m.days[r.date] || (m.days[r.date] = {
      totalTokens: 0, requestCount: 0,
      inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0
    });
    d.totalTokens += r.total_tokens || 0;
    d.requestCount += r.request_count || 0;
    d.inputCacheHitTokens += r.input_cache_hit_tokens || 0;
    d.inputCacheMissTokens += r.input_cache_miss_tokens || 0;
    d.outputTokens += r.completion_tokens || 0;
  }

  // 最近 7 天日期序列
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days7.push(ymd(d));
  }

  function dailyPoints(mk) {
    return days7.map(date => {
      const d = byModel[mk].days[date] || {};
      const [, mm, dd] = date.split('-');
      return {
        date,
        label: `${parseInt(mm, 10)}/${parseInt(dd, 10)}`,
        totalTokens: d.totalTokens || 0,
        requestCount: d.requestCount || 0,
        inputCacheHitTokens: d.inputCacheHitTokens || 0,
        inputCacheMissTokens: d.inputCacheMissTokens || 0,
        outputTokens: d.outputTokens || 0
      };
    });
  }

  // 总趋势（两模型合计）按日
  const trend = days7.map(date => {
    const f = byModel.flash.days[date] || {};
    const p = byModel.pro.days[date] || {};
    const [, mm, dd] = date.split('-');
    return { date, label: `${parseInt(mm, 10)}/${parseInt(dd, 10)}`, totalTokens: (f.totalTokens || 0) + (p.totalTokens || 0) };
  });

  return {
    todayCost: todayCost / 100,
    monthCost: monthCost / 100,
    models: {
      flash: {
        meta: MODELS.flash,
        totalTokens: byModel.flash.totalTokens,
        totalTokensText: formatNumber(byModel.flash.totalTokens),
        cost: byModel.flash.costInCents / 100,
        requestCount: byModel.flash.requestCount,
        daily: dailyPoints('flash')
      },
      pro: {
        meta: MODELS.pro,
        totalTokens: byModel.pro.totalTokens,
        totalTokensText: formatNumber(byModel.pro.totalTokens),
        cost: byModel.pro.costInCents / 100,
        requestCount: byModel.pro.requestCount,
        daily: dailyPoints('pro')
      }
    },
    trend
  };
}

// 构建完整仪表盘状态
async function buildDashboard({ apiKey, importedUsage }) {
  const state = {
    hasApiKey: !!apiKey,
    isAvailable: false,
    totalBalance: 0,
    grantedBalance: 0,
    toppedUpBalance: 0,
    currency: 'CNY',
    todayCost: 0,
    monthCost: 0,
    models: {
      flash: { meta: MODELS.flash, totalTokens: 0, totalTokensText: '0', cost: 0, requestCount: 0, daily: [] },
      pro:   { meta: MODELS.pro,   totalTokens: 0, totalTokensText: '0', cost: 0, requestCount: 0, daily: [] }
    },
    trend: [],
    usageAvailable: false,
    lastUpdated: Date.now(),
    error: null,
    notice: null
  };

  if (!apiKey) { state.error = 'API Key 未配置'; return state; }

  // 1) 余额（官方接口稳定可用）
  const bal = await apiGet('/user/balance', apiKey);
  state.isAvailable = !!bal.is_available;
  const info = preferredBalance(bal.balance_infos);
  if (info) {
    state.currency = info.currency || 'CNY';
    state.totalBalance = parseFloat(info.total_balance) || 0;
    state.grantedBalance = parseFloat(info.granted_balance) || 0;
    state.toppedUpBalance = parseFloat(info.topped_up_balance) || 0;
  }

  // 2) 用量：优先官方接口，404 时回退到本地导入数据
  let records = null;
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const usage = await apiGet('/v1/usage', apiKey, { start_date: ymd(start), end_date: ymd(end) });
    records = usage.data || [];
    state.usageAvailable = true;
  } catch (e) {
    if (e.code === 'notFound') {
      if (importedUsage && importedUsage.length) {
        records = importedUsage;
        state.usageAvailable = true;
        state.notice = '用量数据来自本地导入';
      } else {
        state.notice = 'DeepSeek 当前未公开用量查询接口，已仅显示余额。可在设置中导入 CSV。';
      }
    } else {
      throw e;
    }
  }

  if (records) Object.assign(state, aggregate(records));
  return state;
}

module.exports = { buildDashboard, aggregate, ApiError, MODELS, formatNumber };
