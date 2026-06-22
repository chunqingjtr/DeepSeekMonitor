// 纯 SVG 柱状图，无第三方依赖。
function humanTokens(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// points: [{label, value}]
function barChart(points, opts = {}) {
  const w = opts.width || 320;
  const h = opts.height || 130;
  const gap = opts.gap != null ? opts.gap : 10;
  const padB = 20;                         // 底部日期标签区
  const padT = opts.labelValues ? 20 : 8;  // 顶部数值标签区
  const n = points.length || 1;
  const bw = Math.max(6, (w - gap * (n - 1)) / n);
  const max = Math.max(1, ...points.map(p => p.value || 0));
  const usable = h - padB - padT;

  let bars = '', xlabels = '', vlabels = '';
  points.forEach((p, i) => {
    const x = i * (bw + gap);
    const val = p.value || 0;
    const bh = val > 0 ? Math.max((val / max) * usable, 6) : 3;
    const y = h - padB - bh;
    const r = Math.min(bw / 2, 5);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${r}" fill="${val > 0 ? 'url(#barGrad)' : 'rgba(255,255,255,0.14)'}"/>`;
    xlabels += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="10">${p.label}</text>`;
    if (opts.labelValues && val > 0) {
      vlabels += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="10" font-weight="600">${humanTokens(val)}</text>`;
    }
  });

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6B85FF"/>
        <stop offset="1" stop-color="#4D6BFE" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    ${bars}${xlabels}${vlabels}
  </svg>`;
}
