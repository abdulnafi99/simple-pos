// TAPJERR.io — shared helpers (DOM, formatting, dates)

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape a value for safe interpolation into HTML. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tagged template that escapes interpolations unless wrapped with raw(). */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += renderVal(vals[i]);
  });
  return out;
}
function renderVal(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(renderVal).join('');
  if (v && v.__raw) return v.value;
  return esc(v);
}
export const raw = (value) => ({ __raw: true, value: String(value ?? '') });

export function uid(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function money(n, { symbol = 'RM', space = true } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}${symbol}${space ? ' ' : ''}${s}`;
}

export const num = (n) => (Number(n) || 0).toLocaleString('en-MY');

export function pct(n, digits = 1) {
  const v = Number(n) || 0;
  return `${v.toFixed(digits)}%`;
}

export function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function dateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
}

export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  return addDays(x, -day);
}
export function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
export function startOfYear(d = new Date()) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

/** Resolve a named range to [startMs, endMs]. */
export function rangeOf(name, custom = {}) {
  const now = new Date();
  switch (name) {
    case 'yesterday': {
      const y = addDays(now, -1);
      return [startOfDay(y).getTime(), endOfDay(y).getTime()];
    }
    case 'week':
      return [startOfWeek(now).getTime(), endOfDay(now).getTime()];
    case 'month':
      return [startOfMonth(now).getTime(), endOfDay(now).getTime()];
    case 'year':
      return [startOfYear(now).getTime(), endOfDay(now).getTime()];
    case 'custom': {
      const s = custom.from ? startOfDay(new Date(custom.from + 'T00:00')) : startOfDay(now);
      const e = custom.to ? endOfDay(new Date(custom.to + 'T00:00')) : endOfDay(now);
      return [s.getTime(), e.getTime()];
    }
    case 'today':
    default:
      return [startOfDay(now).getTime(), endOfDay(now).getTime()];
  }
}

export function fmtDate(ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-MY', opts);
}
export function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
}
export function fmtDateTime(ms) {
  if (!ms) return '—';
  return `${fmtDate(ms)}, ${fmtTime(ms)}`;
}
export function longDate(d = new Date()) {
  return new Date(d).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function minutesSince(ms) {
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = '0' + d.slice(2);
  return d;
}

export function validPhone(p) {
  const d = normalizePhone(p);
  return /^0\d{8,10}$/.test(d);
}

export function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

export function sortBy(arr, key, dir = 1) {
  const f = typeof key === 'function' ? key : (x) => x[key];
  return [...arr].sort((a, b) => {
    const va = f(a);
    const vb = f(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function sum(arr, fn = (x) => x) {
  return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
}

/** Read a File into a resized JPEG/PNG data URL. */
export function fileToDataURL(file, maxSize = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(c.toDataURL(type, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function sha256(text) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Non-secure-context fallback (demo mode only)
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return 'djb2-' + h.toString(16);
}

export function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

export function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

export function qs(name, search = location.search) {
  return new URLSearchParams(search).get(name);
}
