// TAPJERR.io — Admin / Staff dashboard shell: auth gate, live data hub, sidebar, router.
import { initStore, store, withDefaults, seedCloudDefaults } from '../core/store.js';
import { isCloudMode, APP } from '../core/config.js';
import { icon } from '../core/icons.js';
import { esc, initials, timeAgo } from '../core/utils.js';
import { toast, chime, openModal } from '../core/ui.js';
import { canAccess, homeFor, ROLES, can } from '../core/permissions.js';
import { DEMO_STAFF } from '../core/seed.js';
import { orderTypeLabel, storeOpenNow } from '../core/orders.js';

export const PAGES = [
  { id: 'overview', group: 'Sales', label: 'Overview', icon: 'layout-dashboard', load: () => import('./pages/overview.js') },
  { id: 'pos', group: 'Sales', label: 'POS / Cashier', short: 'POS', icon: 'calculator', load: () => import('./pages/pos.js') },
  { id: 'tables', group: 'Sales', label: 'Tables', icon: 'armchair', load: () => import('./pages/tables.js') },
  { id: 'qr', group: 'Sales', label: 'QR Ordering', short: 'QR', icon: 'qr-code', load: () => import('./pages/qr.js') },
  { id: 'takeaway', group: 'Sales', label: 'Takeaway', icon: 'shopping-bag', load: () => import('./pages/takeaway.js') },
  { id: 'orders', group: 'Operations', label: 'Orders', icon: 'clipboard-list', load: () => import('./pages/orders.js') },
  { id: 'kitchen', group: 'Operations', label: 'Kitchen Display', short: 'Kitchen', icon: 'chef-hat', load: () => import('./pages/kitchen.js') },
  { id: 'products', group: 'Operations', label: 'Products & Menu', short: 'Menu', icon: 'coffee', load: () => import('./pages/products.js') },
  { id: 'inventory', group: 'Operations', label: 'Inventory', icon: 'package', load: () => import('./pages/inventory.js') },
  { id: 'customers', group: 'Operations', label: 'Customers', icon: 'users', load: () => import('./pages/customers.js') },
  { id: 'reports', group: 'Business', label: 'Reports', icon: 'chart-column', load: () => import('./pages/reports.js') },
  { id: 'staff', group: 'Business', label: 'Staff', icon: 'user-cog', load: () => import('./pages/staff.js') },
  { id: 'settings', group: 'Business', label: 'Settings', icon: 'settings', load: () => import('./pages/settings.js') },
];

const app = document.getElementById('app');

/* ================= Live data hub ================= */
const live = {
  data: { settings: withDefaults(null), orders: [], products: [], categories: [], tables: [], inventory: [], staff: [] },
  ready: new Set(),
  listeners: new Map(),
  unsubs: [],
  get settings() {
    return this.data.settings;
  },
  get orders() {
    return this.data.orders;
  },
  get products() {
    return this.data.products;
  },
  get categories() {
    return this.data.categories;
  },
  get tables() {
    return this.data.tables;
  },
  get inventory() {
    return this.data.inventory;
  },
  get staff() {
    return this.data.staff;
  },
  /** Subscribe to one or more keys. Callback fires now (if ready) and on every change. */
  on(keys, cb) {
    const list = [].concat(keys);
    const fn = () => cb(this);
    list.forEach((k) => {
      if (!this.listeners.has(k)) this.listeners.set(k, new Set());
      this.listeners.get(k).add(fn);
    });
    if (list.every((k) => this.ready.has(k))) queueMicrotask(fn);
    return () => list.forEach((k) => this.listeners.get(k)?.delete(fn));
  },
  set(key, value) {
    this.data[key] = value;
    this.ready.add(key);
    this.listeners.get(key)?.forEach((fn) => fn());
  },
  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.ready.clear();
  },
};

const ORDER_WINDOW_DAYS = 62;

function startLive(profile) {
  live.stop();
  const role = profile.role;
  const mgmt = role === 'super_admin' || role === 'admin';
  let seeded = false;
  live.unsubs.push(
    store.watchDoc('settings', 'store', async (s) => {
      if (!s && store.mode === 'firebase' && mgmt && !seeded) {
        seeded = true;
        try {
          await seedCloudDefaults();
          toast('Selagi Coffee starter menu, tables and settings created.', 'success', { title: 'Store initialised' });
        } catch (e) {
          toast(e.message, 'error', { title: 'Could not initialise store' });
        }
        return;
      }
      live.set('settings', withDefaults(s));
      applyBranding();
    })
  );
  const since = Date.now() - ORDER_WINDOW_DAYS * 86400000;
  let known = null;
  live.unsubs.push(
    store.watch(
      'orders',
      (orders) => {
        orders.sort((a, b) => b.createdAt - a.createdAt);
        if (known) {
          const fresh = orders.filter((o) => !known.has(o.id) && o.source !== 'pos' && Date.now() - o.createdAt < 5 * 60000);
          fresh.forEach((o) => announceOrder(o));
        }
        known = new Set(orders.map((o) => o.id));
        live.set('orders', orders);
      },
      { since }
    )
  );
  ['products', 'categories', 'tables'].forEach((col) => live.unsubs.push(store.watch(col, (list) => live.set(col, list))));
  if (mgmt) {
    live.unsubs.push(store.watch('inventory', (list) => live.set('inventory', list)));
    live.unsubs.push(store.watch('staff', (list) => live.set('staff', list)));
  } else {
    live.set('inventory', []);
    live.set('staff', [profile]);
  }
}

function announceOrder(o) {
  if (live.settings.orderSound) chime();
  const who = o.customer?.name ? ` · ${o.customer.name}` : '';
  toast(`${o.orderNo} — ${orderTypeLabel(o)}${who}`, 'info', { title: 'New order received', timeout: 6000 });
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('New order — ' + live.settings.name, { body: `${o.orderNo} · ${orderTypeLabel(o)}`, icon: 'assets/icon-192.png' });
    } catch {
      /* ignore */
    }
  }
}

function applyBranding() {
  document.title = `${live.settings.name} · TAPJERR.io`;
  const nameEl = document.querySelector('[data-store-name]');
  if (nameEl) nameEl.textContent = live.settings.name;
}

/* ================= Auth ================= */
let profile = null;
let currentPage = null;
let cleanup = null;

async function boot() {
  try {
    await initStore();
  } catch (e) {
    app.innerHTML = `<div class="boot"><p>Could not start: ${esc(e.message)}</p></div>`;
    return;
  }
  store.auth.onChange(async (user) => {
    if (!user) {
      profile = null;
      live.stop();
      renderLogin();
      return;
    }
    let p = await store.get('staff', user.uid).catch(() => null);
    if (!p && store.mode === 'firebase') p = await tryOwnerBootstrap(user);
    if (!p) {
      renderLogin('Your account does not have a staff role yet. Ask the Super Admin to add you under Staff.');
      await store.auth.signOut();
      return;
    }
    if (p.active === false) {
      await store.auth.signOut();
      renderLogin('This account has been deactivated.');
      return;
    }
    profile = p;
    startLive(profile);
    renderShell();
  });
}

// Cloud Mode first run: the owner email configured in firestore.rules may create
// its own Super Admin profile. For anyone else the rules reject this write.
async function tryOwnerBootstrap(user) {
  try {
    const data = { id: user.uid, name: user.email.split('@')[0], email: user.email.toLowerCase(), role: 'super_admin', active: true, createdAt: Date.now(), bootstrap: true };
    await store.set('staff', user.uid, data);
    toast('Super Admin profile created for the store owner.', 'success');
    return data;
  } catch {
    return null;
  }
}

function renderLogin(message = '') {
  cleanup?.();
  cleanup = null;
  currentPage = null;
  const demo = store.mode === 'demo';
  app.innerHTML = `
  <div class="login">
    <section class="login-brand">
      <div class="login-brand-inner">
        <div class="row"><div class="brandmark">T</div><strong class="login-logo">TAPJERR<span>.io</span></strong></div>
        <div>
          <h1>Smart Ordering.<br>Seamless Business.</h1>
          <p>Cloud POS, table QR ordering, takeaway and kitchen display for <b>Selagi Coffee</b> — all in sync, in real time.</p>
        </div>
        <ul class="login-points">
          <li>${icon('qr-code', 18)} Table QR & takeaway ordering — no customer sign-up</li>
          <li>${icon('chef-hat', 18)} Live Kitchen Display with colour-coded status</li>
          <li>${icon('chart-column', 18)} Sales analytics with PDF & CSV export</li>
        </ul>
        <span class="tiny" style="opacity:.6">v${APP.version} · ${demo ? 'Demo Mode' : 'Cloud Mode'}</span>
      </div>
    </section>
    <section class="login-form-wrap">
      <form class="login-form card" novalidate>
        <div>
          <h2>Staff sign in</h2>
          <p class="muted">Selagi Coffee · Admin, cashier & kitchen</p>
        </div>
        ${message ? `<div class="demo-banner tone-red">${icon('circle-alert', 16)} ${esc(message)}</div>` : ''}
        <label class="field"><span>Email</span>
          <div class="input-icon">${icon('mail', 18)}<input class="input" name="email" type="email" autocomplete="username" required placeholder="you@selagi.coffee"></div></label>
        <label class="field"><span>Password</span>
          <div class="input-icon">${icon('lock', 18)}<input class="input" name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="••••••••"></div></label>
        <div class="field-error" data-err></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in ${icon('arrow-right', 18)}</button>
        <div class="row between small">
          <button type="button" class="btn btn-ghost btn-sm" data-reset>Forgot password?</button>
          <a href="order.html" class="btn btn-ghost btn-sm">${icon('smartphone', 16)} Customer ordering</a>
        </div>
        ${
          demo
            ? `<div class="demo-accounts">
            <div class="row between"><strong class="small">Demo accounts</strong><span class="badge tone-amber">Demo Mode</span></div>
            <p class="tiny muted">Firebase is not configured, so data is stored in this browser and syncs live across tabs. Tap to fill:</p>
            ${DEMO_STAFF.map(
              (s) => `<button type="button" class="demo-acc" data-email="${esc(s.email)}" data-pw="${esc(s.password)}">
                <span class="avatar">${esc(initials(s.name))}</span><span class="grow"><b>${esc(ROLES[s.role].label)}</b><span class="tiny muted">${esc(s.email)} · ${esc(s.password)}</span></span>${icon('chevron-right', 16)}</button>`
            ).join('')}
          </div>`
            : ''
        }
        ${store.fallbackReason ? `<p class="tiny muted">Firebase failed to load (${esc(store.fallbackReason)}); running in Demo Mode.</p>` : ''}
      </form>
    </section>
  </div>`;
  const form = app.querySelector('form');
  const err = form.querySelector('[data-err]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const pw = form.password.value;
    err.textContent = '';
    form.email.classList.toggle('invalid', !email);
    form.password.classList.toggle('invalid', pw.length < 6);
    if (!email || pw.length < 6) {
      err.textContent = 'Enter your email and a password of at least 6 characters.';
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    try {
      await store.auth.signIn(email, pw);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.innerHTML = `Sign in ${icon('arrow-right', 18)}`;
    }
  });
  form.querySelectorAll('.demo-acc').forEach((b) =>
    b.addEventListener('click', () => {
      form.email.value = b.dataset.email;
      form.password.value = b.dataset.pw;
      form.requestSubmit();
    })
  );
  form.querySelector('[data-reset]').addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) {
      err.textContent = 'Enter your email above first, then tap "Forgot password?".';
      return;
    }
    try {
      await store.auth.sendReset(email);
      toast('Password reset email sent.', 'success');
    } catch (ex) {
      toast(ex.message, 'info', { timeout: 6000 });
    }
  });
}

/* ================= Shell ================= */
function navItems() {
  return PAGES.filter((p) => canAccess(profile.role, p.id));
}

function renderShell() {
  const items = navItems();
  const pref = localStorage.getItem('tapjerr:sidebar');
  const collapsed = pref ? pref === 'collapsed' : window.innerWidth < 1280;
  const primary = items.filter((p) => ['overview', 'pos', 'orders', 'kitchen', 'tables'].includes(p.id)).slice(0, 4);
  const groups = [...new Set(items.map((p) => p.group))];
  app.innerHTML = `
  <div class="shell ${collapsed ? 'collapsed' : ''}">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="sb-brand">
        <a href="#/${homeFor(profile.role)}" class="sb-logo" title="TAPJERR.io"><span class="sb-mark">${icon('tapjerr', 22)}</span><span class="sb-word">TAPJERR<b>.io</b></span></a>
      </div>
      <a class="sb-store" href="#/${canAccess(profile.role, 'settings') ? 'settings' : homeFor(profile.role)}" title="${esc(live.settings.name)}">
        <span class="sb-store-logo" data-store-logo>${esc((live.settings.name || 'S')[0])}</span>
        <span class="sb-store-txt"><b data-store-name>${esc(live.settings.name)}</b><small>${store.mode === 'demo' ? 'Demo Mode' : 'Cloud POS'}</small></span>
      </a>
      <nav class="sb-nav">
        ${groups
          .map(
            (g) => `<div class="sb-group"><span class="sb-label">${esc(g)}</span>${items
              .filter((p) => p.group === g)
              .map((p) => `<a href="#/${p.id}" class="sb-item" data-page="${p.id}" title="${esc(p.label)}">${icon(p.icon, 20)}<span>${esc(p.label)}</span><i class="sb-badge" data-badge="${p.id}"></i></a>`)
              .join('')}</div>`
          )
          .join('')}
      </nav>
      <div class="sb-foot">
        <button class="sb-toggle" aria-label="Toggle sidebar">${icon('panel-left', 18)}<span>Collapse</span></button>
      </div>
    </aside>
    <main class="main" id="main">
      <header class="topbar no-print">
        <div class="tb-title"><span class="tb-icon" data-tb-icon></span><div><small data-store-name>${esc(live.settings.name)}</small><b data-tb-title></b></div></div>
        <form class="tb-search" data-search role="search"><span>${icon('search', 18)}</span><input name="q" placeholder="Search order no, customer, phone…" autocomplete="off"><kbd>/</kbd></form>
        <div class="tb-actions">
          <a class="tb-status" data-tb-status href="#/${canAccess(profile.role, 'settings') ? 'settings?tab=hours' : homeFor(profile.role)}"></a>
          ${canAccess(profile.role, 'pos') ? `<a class="btn btn-primary btn-sm tb-new" href="#/pos">${icon('plus', 16)}<span>New Sale</span></a>` : ''}
          <button class="tb-btn" data-bell aria-label="Notifications">${icon('bell', 20)}<i class="tb-dot" data-bell-count></i></button>
          <button class="tb-user" data-user><span class="avatar">${esc(initials(profile.name))}</span><span class="tb-user-txt"><b>${esc(profile.name)}</b><small>${esc(ROLES[profile.role]?.label || '')}</small></span>${icon('chevron-down', 16)}</button>
        </div>
      </header>
      <div id="page"></div>
    </main>
    <nav class="bottom-nav" aria-label="Quick navigation">
      ${primary.map((p) => `<a href="#/${p.id}" data-page="${p.id}">${icon(p.icon, 22)}<span>${esc(p.short || p.label)}</span><i class="sb-badge" data-badge="${p.id}"></i></a>`).join('')}
      <button data-more>${icon('layout-grid', 22)}<span>More</span></button>
    </nav>
  </div>`;
  app.querySelector('.sb-toggle').onclick = () => {
    const s = app.querySelector('.shell');
    s.classList.toggle('collapsed');
    localStorage.setItem('tapjerr:sidebar', s.classList.contains('collapsed') ? 'collapsed' : 'open');
  };
  app.querySelector('[data-user]').onclick = userMenu;
  app.querySelector('[data-more]').onclick = moreMenu;
  app.querySelector('[data-bell]').onclick = notificationsPanel;
  const search = app.querySelector('[data-search]');
  search.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = search.q.value.trim();
    if (!q) return;
    navigate('orders', { tab: 'all', q });
    search.q.blur();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !document.querySelector('.modal-backdrop')) {
      e.preventDefault();
      search.q.focus();
    }
  });
  live.on('orders', updateBadges);
  live.on('inventory', updateBadges);
  live.on('settings', updateTopbar);
  if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
  }
  route();
}

function notifications() {
  const list = [];
  live.orders.filter((o) => o.status === 'new').slice(0, 6).forEach((o) => list.push({ ic: 'bell-ring', tone: 'tone-blue', title: `New order ${o.orderNo}`, sub: `${orderTypeLabel(o)} · ${timeAgo(o.createdAt)}`, order: o.id }));
  live.orders.filter((o) => o.paymentStatus === 'pending_verification').slice(0, 5).forEach((o) => list.push({ ic: 'badge-alert', tone: 'tone-amber', title: `Verify payment ${o.orderNo}`, sub: `RM ${o.total.toFixed(2)} · ref ${o.paymentRef || '—'}`, order: o.id }));
  live.orders.filter((o) => o.status === 'ready').slice(0, 4).forEach((o) => list.push({ ic: 'bell', tone: 'tone-green', title: `Ready: ${o.orderNo}`, sub: orderTypeLabel(o), order: o.id }));
  live.inventory.filter((i) => i.stock <= i.lowAt).slice(0, 4).forEach((i) => list.push({ ic: 'package', tone: 'tone-red', title: `Low stock: ${i.name}`, sub: `${i.stock} ${i.unit} left`, href: '#/inventory' }));
  return list;
}

function notificationsPanel() {
  const list = notifications();
  const { el, close } = openModal({
    title: 'Notifications',
    size: 'sm',
    body: list.length
      ? `<div class="notif-list">${list.map((n, i) => `<button class="notif" data-n="${i}"><span class="mini-icon ${n.tone}">${icon(n.ic, 18)}</span><div class="grow"><strong>${esc(n.title)}</strong><span>${esc(n.sub)}</span></div>${icon('chevron-right', 16)}</button>`).join('')}</div>`
      : `<div class="empty"><div class="empty-art">${icon('bell', 36)}</div><h4>You're all caught up</h4><p>New orders, payments and stock alerts appear here.</p></div>`,
  });
  el.querySelectorAll('[data-n]').forEach((b) =>
    b.addEventListener('click', async () => {
      const n = list[Number(b.dataset.n)];
      close();
      if (n.order) {
        const { openOrderDetail } = await import('./common.js');
        openOrderDetail(n.order, { user: profile, role: profile.role, live, navigate, can: (a) => can(profile.role, a), store });
      } else if (n.href) location.hash = n.href;
    })
  );
}

function updateTopbar() {
  const s = live.settings;
  const st = document.querySelector('[data-tb-status]');
  if (st) {
    const open = storeOpenNow(s);
    st.className = `tb-status ${open ? 'open' : ''}`;
    st.innerHTML = `<i></i><span>${open ? 'Store open' : 'Store closed'}</span>`;
  }
  document.querySelectorAll('[data-store-name]').forEach((n) => (n.textContent = s.name));
  const logo = document.querySelector('[data-store-logo]');
  if (logo) logo.innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.name || 'S')[0]);
}

function updateBadges() {
  const counts = {
    orders: live.orders.filter((o) => o.status === 'new' || o.paymentStatus === 'pending_verification').length,
    kitchen: live.orders.filter((o) => ['new', 'confirmed', 'preparing'].includes(o.status)).length,
    takeaway: live.orders.filter((o) => o.type === 'takeaway' && ['new'].includes(o.status)).length,
    inventory: live.inventory.filter((i) => i.stock <= i.lowAt).length,
  };
  document.querySelectorAll('[data-badge]').forEach((b) => {
    const n = counts[b.dataset.badge] || 0;
    b.textContent = n > 99 ? '99+' : n || '';
    b.classList.toggle('show', n > 0);
  });
  const bell = document.querySelector('[data-bell-count]');
  if (bell) {
    const n = notifications().length;
    bell.textContent = n > 9 ? '9+' : n || '';
    bell.classList.toggle('show', n > 0);
  }
}

function userMenu() {
  const { el, close } = openModal({
    title: 'Account',
    size: 'sm',
    body: `<div class="row gap-lg"><span class="avatar" style="width:52px;height:52px;font-size:17px">${esc(initials(profile.name))}</span>
      <div><strong>${esc(profile.name)}</strong><div class="small muted">${esc(profile.email)}</div>
      <span class="badge tone-${ROLES[profile.role]?.tone}">${esc(ROLES[profile.role]?.label)}</span></div></div>
      <p class="small muted mt">${esc(ROLES[profile.role]?.desc || '')}</p>
      <div class="col mt">
        <a class="btn btn-outline" href="kitchen.html" target="_blank" rel="noopener">${icon('monitor', 18)} Open Kitchen Display (fullscreen)</a>
        <a class="btn btn-outline" href="order.html" target="_blank" rel="noopener">${icon('smartphone', 18)} Open Customer Ordering</a>
      </div>`,
    footer: `<button class="btn btn-danger btn-block" data-out>${icon('log-out', 18)} Sign out</button>`,
  });
  el.querySelector('[data-out]').onclick = async () => {
    close();
    await store.auth.signOut();
  };
}

function moreMenu() {
  const { el, close } = openModal({
    title: 'Menu',
    size: 'sm',
    body: `<div class="more-grid">${navItems()
      .map((p) => `<a href="#/${p.id}" class="more-item ${currentPage === p.id ? 'active' : ''}">${icon(p.icon, 24)}<span>${esc(p.label)}</span></a>`)
      .join('')}</div>
      <button class="btn btn-outline btn-block mt" data-acc>${icon('circle-user', 18)} ${esc(profile.name)}</button>`,
  });
  el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close()));
  el.querySelector('[data-acc]').onclick = () => {
    close();
    userMenu();
  };
}

/* ================= Router ================= */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = h.split('?');
  return { page: path || homeFor(profile.role), params: new URLSearchParams(q) };
}

export function navigate(page, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${page}${q ? '?' + q : ''}`;
}

async function route() {
  if (!profile) return;
  let { page, params } = parseHash();
  const def = PAGES.find((p) => p.id === page);
  if (!def || !canAccess(profile.role, page)) {
    if (def) toast(`Your role (${ROLES[profile.role].label}) cannot access ${def.label}.`, 'warning');
    page = homeFor(profile.role);
    history.replaceState(null, '', `#/${page}`);
    params = new URLSearchParams();
  }
  document.querySelectorAll('[data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  const pdef = PAGES.find((p) => p.id === page);
  const tbt = document.querySelector('[data-tb-title]');
  if (tbt) tbt.textContent = pdef.label;
  const tbi = document.querySelector('[data-tb-icon]');
  if (tbi) tbi.innerHTML = icon(pdef.icon, 20);
  document.querySelector('.shell')?.classList.toggle('kds-mode', page === 'kitchen');
  updateTopbar();
  const root = document.getElementById('page');
  if (!root) return;
  const samePage = currentPage === page;
  cleanup?.();
  cleanup = null;
  currentPage = page;
  if (!samePage) {
    root.innerHTML = `<div class="page"><div class="skeleton" style="height:32px;width:220px;margin-bottom:24px"></div><div class="grid-cards">${'<div class="card"><div class="skeleton-wrap"><div class="skeleton"></div><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:40%"></div></div></div>'.repeat(4)}</div></div>`;
  }
  try {
    const mod = (await def.load()).default;
    if (currentPage !== page) return;
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'page' + (samePage ? '' : ' page-enter') + (mod.fullBleed ? ' full-bleed' : '');
    root.appendChild(el);
    const ctx = {
      user: profile,
      role: profile.role,
      live,
      params,
      navigate,
      can: (a) => can(profile.role, a),
      store,
      cloud: isCloudMode() && store.mode === 'firebase',
    };
    cleanup = mod.render(el, ctx) || null;
    if (!samePage) document.getElementById('main')?.scrollTo?.(0, 0);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="page"><div class="card">${icon('circle-alert', 22)}<h3 class="mt">Could not load this page</h3><p class="muted">${esc(e.message)}</p></div></div>`;
  }
}

window.addEventListener('hashchange', route);
boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
