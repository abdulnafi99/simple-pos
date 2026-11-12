// TAPJERR.io — dependency-free SVG charts with hover tooltips.
import { esc } from './utils.js';

// Validated categorical order (CVD-safe adjacent pairs). Text never uses these colors.
export const SERIES = ['#2a44c9', '#e08a1e', '#2fa8d8', '#b0418f', '#2e9e5b'];

const observers = new WeakMap();
function mount(el, draw) {
  observers.get(el)?.disconnect();
  const render = () => draw(Math.max(240, el.clientWidth || 600));
  render();
  if ('ResizeObserver' in window) {
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) > 4) {
        w = el.clientWidth;
        render();
      }
    });
    ro.observe(el);
    observers.set(el, ro);
  }
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

function tooltip(el) {
  let t = el.querySelector('.chart-tip');
  if (!t) {
    t = document.createElement('div');
    t.className = 'chart-tip';
    el.appendChild(t);
  }
  return t;
}

function shortNum(v) {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 100) / 100);
}

/** Area/line chart. opts: { labels, series:[{name, values, color}], format, height } */
export function lineChart(el, { labels = [], series = [], format = (v) => v, height = 240 } = {}) {
  el.classList.add('chart');
  mount(el, (W) => {
    const H = height;
    const pad = { l: 44, r: 12, t: 12, b: 28 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
    const n = labels.length;
    const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const ticks = 4;
    let grid = '';
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i;
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
      grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${shortNum(v)}</text>`;
    }
    const every = Math.ceil(n / Math.max(2, Math.floor(iw / 56)));
    let xl = '';
    labels.forEach((l, i) => {
      if (i % every === 0 || i === n - 1) xl += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(l)}</text>`;
    });
    let paths = '';
    series.forEach((s, si) => {
      const c = s.color || SERIES[si % SERIES.length];
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
      if (!pts.length) return;
      if (series.length === 1) {
        paths += `<path d="M${pts[0]} L${pts.join(' L')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#ga${si})" opacity=".9"/>`;
      }
      paths += `<defs><linearGradient id="ga${si}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>`;
      paths += `<path d="M${pts.join(' L')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="line-draw"/>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} chart">
      ${grid}${xl}${paths}
      <line class="crosshair" y1="${pad.t}" y2="${pad.t + ih}" x1="0" x2="0" style="display:none"/>
      <g class="dots"></g>
      <rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>`;
    const svg = el.querySelector('svg');
    const hit = svg.querySelector('.hit');
    const cross = svg.querySelector('.crosshair');
    const dots = svg.querySelector('.dots');
    const tip = tooltip(el);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.style.display = '';
      dots.innerHTML = series
        .map((s, si) => `<circle cx="${x(i)}" cy="${y(s.values[i] || 0)}" r="5" fill="${s.color || SERIES[si]}" stroke="var(--surface)" stroke-width="2"/>`)
        .join('');
      tip.innerHTML = `<b>${esc(labels[i])}</b>${series
        .map((s, si) => `<div><i style="background:${s.color || SERIES[si]}"></i>${esc(s.name)} <strong>${esc(format(s.values[i] || 0))}</strong></div>`)
        .join('')}`;
      tip.style.display = 'block';
      const tx = (x(i) / W) * r.width;
      tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, tx - tip.offsetWidth / 2))}px`;
      tip.style.top = `0px`;
    };
    const leave = () => {
      cross.style.display = 'none';
      dots.innerHTML = '';
      tip.style.display = 'none';
    };
    hit.addEventListener('mousemove', move);
    hit.addEventListener('touchstart', (e) => move(e.touches[0]), { passive: true });
    hit.addEventListener('mouseleave', leave);
  });
}

/** Bar chart. opts: { labels, values, color, format, height, horizontal } */
export function barChart(el, { labels = [], values = [], color = SERIES[0], format = (v) => v, height = 240, horizontal = false } = {}) {
  el.classList.add('chart');
  if (horizontal) {
    const max = Math.max(1, ...values);
    el.innerHTML = `<div class="hbars">${labels
      .map(
        (l, i) => `<div class="hbar" title="${esc(l)}: ${esc(format(values[i]))}">
        <span class="hbar-label">${esc(l)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${(values[i] / max) * 100}%;background:${color}"></span></span>
        <span class="hbar-val">${esc(format(values[i]))}</span></div>`
      )
      .join('')}</div>`;
    return;
  }
  mount(el, (W) => {
    const H = height;
    const pad = { l: 44, r: 8, t: 12, b: 28 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(0, ...values));
    const n = values.length || 1;
    const slot = iw / n;
    const bw = Math.max(4, Math.min(36, slot - 2));
    const y = (v) => pad.t + ih - (v / max) * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${shortNum(v)}</text>`;
    }
    const every = Math.ceil(n / Math.max(2, Math.floor(iw / 48)));
    let bars = '';
    values.forEach((v, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = Math.max(0, pad.t + ih - y(v));
      const r = Math.min(4, bw / 2, h);
      const top = y(v);
      const x0 = cx - bw / 2;
      const d = h > 0 ? `M${x0},${pad.t + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${pad.t + ih} Z` : '';
      bars += `<g class="bar" data-i="${i}"><rect x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}" fill="transparent"/>${d ? `<path d="${d}" fill="${color}"/>` : ''}</g>`;
      if (i % every === 0 || i === n - 1) bars += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="axis">${esc(labels[i])}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Bar chart">${g}${bars}</svg>`;
    const tip = tooltip(el);
    const svg = el.querySelector('svg');
    svg.querySelectorAll('.bar').forEach((b) => {
      b.addEventListener('mouseenter', () => {
        const i = Number(b.dataset.i);
        b.classList.add('hover');
        tip.innerHTML = `<b>${esc(labels[i])}</b><div><strong>${esc(format(values[i]))}</strong></div>`;
        tip.style.display = 'block';
        const r = svg.getBoundingClientRect();
        const cx = ((pad.l + slot * i + slot / 2) / W) * r.width;
        tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, cx - tip.offsetWidth / 2))}px`;
        tip.style.top = '0px';
      });
      b.addEventListener('mouseleave', () => {
        b.classList.remove('hover');
        tip.style.display = 'none';
      });
    });
  });
}

/** Donut chart with legend. opts: { segments:[{label, value, color}], format, center, centerLabel } */
export function donutChart(el, { segments = [], format = (v) => v, center = '', centerLabel = '', size = 150 } = {}) {
  el.classList.add('chart', 'donut-wrap');
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  let off = 0;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  const arcs = segments
    .map((s, i) => {
      if (!total || !s.value) return '';
      const len = (s.value / total) * C;
      const a = `<circle class="arc" data-i="${i}" r="${R}" cx="80" cy="80" fill="none" stroke="${s.color || SERIES[i % SERIES.length]}" stroke-width="20"
        stroke-dasharray="${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"/>`;
      off += len;
      return a;
    })
    .join('');
  el.innerHTML = `
    <div class="donut" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="Breakdown chart">
        <circle r="${R}" cx="80" cy="80" fill="none" stroke="var(--track)" stroke-width="20"/>
        ${arcs}
      </svg>
      <div class="donut-center"><strong>${esc(center)}</strong><span>${esc(centerLabel)}</span></div>
    </div>
    <ul class="legend">${segments
      .map(
        (s, i) => `<li data-i="${i}"><i style="background:${s.color || SERIES[i % SERIES.length]}"></i><span>${esc(s.label)}</span>
        <b>${esc(format(s.value))}</b><em>${total ? Math.round((s.value / total) * 100) : 0}%</em></li>`
      )
      .join('')}</ul>`;
  const hl = (i, on) => {
    el.querySelectorAll(`[data-i]`).forEach((n) => n.classList.toggle('dim', on && n.dataset.i !== String(i)));
  };
  el.querySelectorAll('[data-i]').forEach((n) => {
    n.addEventListener('mouseenter', () => hl(n.dataset.i, true));
    n.addEventListener('mouseleave', () => hl(n.dataset.i, false));
  });
}
