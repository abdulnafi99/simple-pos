// TAPJERR.io — Kitchen Display System (embedded in dashboard and standalone kitchen.html)
import { icon } from '../../core/icons.js';
import { esc, fmtTime, minutesSince } from '../../core/utils.js';
import { toast, chime } from '../../core/ui.js';
import { updateStatus, orderTypeLabel } from '../../core/orders.js';

export function renderKDS(root, { live, user, embedded = true, extraHead = '' }) {
  let filter = localStorage.getItem('tapjerr:kds-filter') || 'all';
  let sound = localStorage.getItem('tapjerr:kds-sound') !== 'off';
  let known = null;
  root.innerHTML = `<div class="kds ${embedded ? 'embedded' : ''}">
    <div class="kds-head">
      <h1>${icon('chef-hat', 28)} Kitchen Display <span class="kds-clock" data-clock></span></h1>
      <div class="kds-stats" data-stats></div>
      <div class="row wrap">
        <div class="seg" data-filter>
          <button data-f="all">All</button><button data-f="dine-in">Dine-in</button><button data-f="takeaway">Takeaway</button>
        </div>
        <button class="btn btn-sm" style="background:#181d48;color:#fff" data-sound title="Toggle new-order sound">${icon(sound ? 'volume-2' : 'volume-x', 18)}</button>
        <button class="btn btn-sm" style="background:#181d48;color:#fff" data-fs title="Fullscreen">${icon('maximize', 18)}</button>
        ${extraHead}
      </div>
    </div>
    <div data-grid></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const prep = () => live.settings.prepMinutes || 15;

  function visible() {
    return live.orders
      .filter((o) => ['new', 'confirmed', 'preparing'].includes(o.status) || (o.status === 'ready' && minutesSince(o.statusHistory?.slice(-1)[0]?.at || o.updatedAt) < 20))
      .filter((o) => filter === 'all' || o.type === filter)
      .sort((a, b) => {
        const rank = (o) => (o.status === 'ready' ? 1 : 0);
        return rank(a) - rank(b) || a.createdAt - b.createdAt;
      });
  }

  function render() {
    const list = visible();
    const all = live.orders;
    const c = (s) => all.filter((o) => (s === 'new' ? ['new', 'confirmed'].includes(o.status) : o.status === s)).length;
    $('[data-stats]').innerHTML = `
      <span class="kds-stat"><b style="color:#7d93ff">${c('new')}</b> New</span>
      <span class="kds-stat"><b style="color:#ffb550">${c('preparing')}</b> Preparing</span>
      <span class="kds-stat"><b style="color:#6cd06c">${c('ready')}</b> Ready</span>`;
    root.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
    if (!list.length) {
      $('[data-grid]').innerHTML = `<div class="kds-empty"><div class="empty-art">${icon('coffee', 40)}</div><h3>All caught up</h3><p>New orders from POS, table QR and online takeaway appear here instantly.</p></div>`;
      return;
    }
    $('[data-grid]').innerHTML = `<div class="kds-grid">${list
      .map((o) => {
        const mins = minutesSince(o.createdAt);
        const late = o.status !== 'ready' && mins >= prep();
        const label = o.status === 'confirmed' ? 'new' : o.status;
        const action =
          o.status === 'new' || o.status === 'confirmed'
            ? `<button class="btn btn-primary" data-to="preparing" data-id="${esc(o.id)}">${icon('flame', 20)} Start Preparing</button>`
            : o.status === 'preparing'
              ? `<button class="btn btn-success" data-to="ready" data-id="${esc(o.id)}">${icon('bell', 20)} Mark Ready</button>`
              : `<button class="btn btn-outline" data-to="preparing" data-id="${esc(o.id)}">${icon('undo-2', 18)} Recall</button>${user.role !== 'kitchen' ? `<button class="btn btn-soft" data-to="completed" data-id="${esc(o.id)}">${icon('check-check', 18)} ${o.type === 'dine-in' ? 'Served' : 'Picked up'}</button>` : ''}`;
        return `<article class="kds-card s-${label === 'new' ? 'new' : o.status} ${late ? 'late' : ''}">
          <header><div><div class="no">#${esc(o.orderNo.split('-').pop())}</div><div class="where">${icon(o.type === 'dine-in' ? 'utensils' : 'shopping-bag', 15)} ${esc(orderTypeLabel(o))}${o.customer?.name ? ' · ' + esc(o.customer.name) : ''}</div></div>
            <div class="t"><b>${mins}m</b>${esc(fmtTime(o.createdAt))}<div>${esc(o.status === 'ready' ? 'READY' : o.status === 'preparing' ? 'PREPARING' : 'NEW')}</div></div></header>
          <ul class="kds-items">${o.items
            .map((i) => `<li><span class="q">${i.qty}×</span><div><div class="n">${esc(i.name)}</div>${i.options?.length ? `<div class="o">${esc(i.options.map((x) => x.name).join(' · '))}</div>` : ''}${i.note ? `<div class="note">${icon('message-square', 13)} ${esc(i.note)}</div>` : ''}</div></li>`)
            .join('')}</ul>
          ${o.note ? `<div class="kds-note">${icon('triangle-alert', 14)} ${esc(o.note)}</div>` : ''}
          ${o.pickupAt ? `<div class="kds-note" style="background:var(--primary-50);color:var(--primary)">${icon('clock', 14)} Pickup ${esc(fmtTime(o.pickupAt))}</div>` : ''}
          <footer>${action}</footer>
        </article>`;
      })
      .join('')}</div>`;
    root.querySelectorAll('[data-to]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        const o = live.orders.find((x) => x.id === b.dataset.id);
        try {
          await updateStatus(o, b.dataset.to, user.name, live.settings);
        } catch (e) {
          toast(e.message, 'error');
          b.disabled = false;
        }
      })
    );
  }

  const tickClock = () => {
    const el = $('[data-clock]');
    if (el) el.textContent = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  };
  tickClock();
  root.querySelectorAll('[data-f]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.f;
      localStorage.setItem('tapjerr:kds-filter', filter);
      render();
    })
  );
  $('[data-sound]').addEventListener('click', (e) => {
    sound = !sound;
    localStorage.setItem('tapjerr:kds-sound', sound ? 'on' : 'off');
    e.currentTarget.innerHTML = icon(sound ? 'volume-2' : 'volume-x', 18);
    if (sound) chime();
  });
  $('[data-fs]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.querySelector('.kds').requestFullscreen?.().catch(() => toast('Fullscreen not available.', 'info'));
  });
  const unsub = live.on('orders', () => {
    const ids = new Set(live.orders.filter((o) => ['new', 'confirmed'].includes(o.status)).map((o) => o.id));
    if (known && sound && [...ids].some((id) => !known.has(id))) chime();
    known = ids;
    render();
  });
  const t = setInterval(() => {
    tickClock();
    render();
  }, 30000);
  return () => {
    unsub();
    clearInterval(t);
  };
}

export default {
  fullBleed: true,
  render(root, ctx) {
    return renderKDS(root, { live: ctx.live, user: ctx.user, embedded: true, extraHead: `<a class="btn btn-sm" style="background:#181d48;color:#fff" href="kitchen.html" target="_blank" rel="noopener" title="Open standalone kitchen screen">${icon('external-link', 18)}</a>` });
  },
};
