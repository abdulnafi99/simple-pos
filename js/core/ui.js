// TAPJERR.io — UI primitives: toast, modal, confirm, count-up, skeletons
import { icon } from './icons.js';
import { esc } from './utils.js';

/* ---------------- Toasts ---------------- */
let toastRoot;
export function toast(message, type = 'info', { timeout = 3200, title } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toast-root';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }
  const icons = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icon(icons[type] || 'info', 18)}</span>
    <div class="toast-body">${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>
    <button class="toast-close" aria-label="Dismiss">${icon('x', 16)}</button>`;
  toastRoot.appendChild(el);
  const close = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector('.toast-close').onclick = close;
  if (timeout) setTimeout(close, timeout);
  return close;
}

/* ---------------- Modal ---------------- */
/**
 * openModal({ title, body (html string), size: 'sm'|'md'|'lg'|'xl', footer (html), onOpen(el), onClose })
 * Returns { el, close }.
 */
export function openModal({ title = '', body = '', footer = '', size = 'md', onOpen, onClose, dismissible = true, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal modal-${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<header class="modal-head"><h3>${esc(title)}</h3>
        <button class="icon-btn modal-x" aria-label="Close">${icon('x', 20)}</button></header>` : ''}
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('show'));
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      wrap.remove();
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
      prevFocus?.focus?.();
    }, 200);
    onClose?.(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible && wrap === [...document.querySelectorAll('.modal-backdrop')].pop()) close();
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap && dismissible) close();
  });
  wrap.querySelector('.modal-x')?.addEventListener('click', () => close());
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
  const modal = wrap.querySelector('.modal');
  onOpen?.(modal, close);
  setTimeout(() => {
    const f = modal.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
    f?.focus?.();
  }, 60);
  return { el: modal, close };
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const { el, close } = openModal({
      title,
      size: 'sm',
      body: `<p class="muted">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmText)}</button>`,
      onClose: () => resolve(result),
    });
    el.querySelector('[data-ok]').onclick = () => {
      result = true;
      close();
    };
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', type = 'text', confirmText = 'Save' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const { el, close } = openModal({
      title,
      size: 'sm',
      body: `<form class="form" data-f><label class="field"><span>${esc(label)}</span>
        <input class="input" name="v" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" required></label></form>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>${esc(confirmText)}</button>`,
      onClose: () => resolve(result),
    });
    const submit = (e) => {
      e?.preventDefault();
      const v = el.querySelector('[name=v]').value.trim();
      if (!v) return;
      result = v;
      close();
    };
    el.querySelector('[data-f]').onsubmit = submit;
    el.querySelector('[data-ok]').onclick = submit;
  });
}

/* ---------------- Count-up animation ---------------- */
const counted = new WeakMap();
export function countUp(el, to, { duration = 700, format = (v) => Math.round(v).toString() } = {}) {
  if (!el) return;
  const from = counted.get(el) ?? 0;
  counted.set(el, to);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = format(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function animateCounters(root, formatters = {}) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const v = Number(el.dataset.count) || 0;
    const fmt = formatters[el.dataset.fmt] || ((x) => Math.round(x).toLocaleString('en-MY'));
    countUp(el, v, { format: fmt });
  });
}

/* ---------------- Skeletons / empty states ---------------- */
export function skeleton(lines = 3, cls = '') {
  return `<div class="skeleton-wrap ${cls}">${Array.from({ length: lines }, (_, i) => `<div class="skeleton" style="width:${90 - i * 12}%"></div>`).join('')}</div>`;
}
export function skeletonCards(n = 4) {
  return `<div class="grid-cards">${Array.from({ length: n }, () => `<div class="card">${skeleton(3)}</div>`).join('')}</div>`;
}

export function emptyState({ iconName = 'inbox', title = 'Nothing here yet', text = '', action = '' } = {}) {
  return `<div class="empty">
    <div class="empty-art">${icon(iconName, 40)}</div>
    <h4>${esc(title)}</h4>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action}
  </div>`;
}

/* ---------------- Sound (new order chime) ---------------- */
let audioCtx;
export function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + i * 0.15);
      o.stop(now + i * 0.15 + 0.45);
    });
  } catch {
    /* audio not available */
  }
}

/** Bind a <form> submit, collect values, show a busy state on the submit button. */
export function formValues(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  form.querySelectorAll('input[type=checkbox][name]').forEach((c) => {
    if (!c.dataset.multi) out[c.name] = c.checked;
  });
  return out;
}

export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('busy');
  btn.innerHTML = `<span class="spinner"></span>${prev}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('busy');
    btn.innerHTML = prev;
  }
}
