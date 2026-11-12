// TAPJERR.io — Customer ordering (table QR dine-in & takeaway). No account required.
import { initStore, store, withDefaults } from '../core/store.js';
import { icon } from '../core/icons.js';
import { esc, money, uid, round2, isoDate, pad, validPhone, normalizePhone, fmtTime, fmtDateTime, debounce, addDays } from '../core/utils.js';
import { toast, openModal, emptyState, withBusy } from '../core/ui.js';
import { productImage } from '../core/seed.js';
import { computeTotals, createOrder, unitPrice, itemCount, storeOpenNow, todayHours, fmt12, STATUS_META, PAYMENT_META } from '../core/orders.js';

const app = document.getElementById('app');
const CART_KEY = 'tapjerr:c-cart';
const MODE_KEY = 'tapjerr:c-mode';
const ORDERS_KEY = 'tapjerr:c-orders';
const PROFILE_KEY = 'tapjerr:c-profile';

const safeGet = (k, fb, storage = localStorage) => {
  try {
    return JSON.parse(storage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};
const safeSet = (k, v, storage = localStorage) => {
  try {
    storage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

const S = {
  settings: withDefaults(null),
  products: [],
  categories: [],
  tables: [],
  ready: { settings: false, products: false, categories: false, tables: false },
  cart: safeGet(CART_KEY, []),
  mode: safeGet(MODE_KEY, null, sessionStorage), // { type: 'dine-in'|'takeaway', tableNumber, tableId }
  note: '',
  cat: 'all',
  q: '',
};
let cleanupView = null;

/* ---------- Mode from URL ---------- */
function modeFromUrl() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  let m = path.match(/\/order\/table\/([^/?#]+)/);
  const table = m ? decodeURIComponent(m[1]) : params.get('table');
  if (table) return { type: 'dine-in', tableNumber: table.replace(/[^\w-]/g, '') };
  if (/\/order\/takeaway/.test(path) || params.get('mode') === 'takeaway') return { type: 'takeaway' };
  return null;
}

/* ---------- Boot ---------- */
async function boot() {
  try {
    await initStore();
  } catch (e) {
    app.innerHTML = `<div class="c-boot"><p>Sorry, ordering is unavailable right now. ${esc(e.message)}</p></div>`;
    return;
  }
  const urlMode = modeFromUrl();
  if (urlMode) setMode(urlMode);
  const onReady = () => {
    if (Object.values(S.ready).every(Boolean)) {
      resolveTable();
      if (!app.querySelector('.c-shell')) renderShell();
      refresh();
    }
  };
  store.watchDoc('settings', 'store', (s) => {
    S.settings = withDefaults(s);
    S.ready.settings = true;
    document.title = `Order · ${S.settings.name}`;
    onReady();
  });
  store.watch('products', (list) => {
    S.products = list.filter((p) => p.enabled !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
    S.ready.products = true;
    syncCart();
    onReady();
  });
  store.watch('categories', (list) => {
    S.categories = list.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    S.ready.categories = true;
    onReady();
  });
  store.watch('tables', (list) => {
    S.tables = list;
    S.ready.tables = true;
    onReady();
  });
}

function setMode(m) {
  S.mode = m;
  safeSet(MODE_KEY, m, sessionStorage);
}
function resolveTable() {
  if (S.mode?.type === 'dine-in') {
    const t = S.tables.find((x) => x.number === S.mode.tableNumber || x.number === S.mode.tableNumber.padStart(2, '0'));
    S.mode.tableId = t?.id || '';
    S.mode.valid = !!t;
    if (t) S.mode.tableNumber = t.number;
  }
}

/** Drop cart lines whose product disappeared or sold out; refresh prices. */
function syncCart() {
  const before = S.cart.length;
  S.cart = S.cart.filter((l) => {
    const p = S.products.find((x) => x.id === l.productId);
    if (!p || p.soldOut) return false;
    l.price = unitPrice(p, l.options);
    return true;
  });
  if (S.cart.length !== before) toast('Some items in your cart are no longer available and were removed.', 'warning');
  saveCart();
}
function saveCart() {
  safeSet(CART_KEY, S.cart);
  const n = itemCount(S.cart);
  app.querySelectorAll('[data-cart-count]').forEach((b) => {
    b.textContent = n;
    b.classList.toggle('show', n > 0);
  });
  const bar = app.querySelector('[data-cartbar]');
  if (bar) {
    const t = totals();
    bar.classList.toggle('show', n > 0 && !['cart', 'checkout'].includes(currentRoute().name));
    bar.querySelector('[data-cb-text]').innerHTML = `<b>${n} item${n > 1 ? 's' : ''}</b> · ${money(t.total)}`;
  }
}
const totals = () => computeTotals(S.cart, S.settings, { type: S.mode?.type || 'takeaway' });

function canOrder() {
  const s = S.settings;
  if (!storeOpenNow(s)) {
    const h = todayHours(s);
    return { ok: false, reason: `We're closed right now${h && !h.closed ? ` · Open today ${fmt12(h.open)} – ${fmt12(h.close)}` : ''}.`, allowSchedule: S.mode?.type === 'takeaway' };
  }
  if (S.mode?.type === 'dine-in' && !s.dineInQrEnabled) return { ok: false, reason: 'Table ordering is paused. Please order at the counter.' };
  if (S.mode?.type === 'dine-in' && !S.mode.valid) return { ok: false, reason: `Table "${S.mode.tableNumber}" was not found. Please rescan the QR code or ask our staff.` };
  if (S.mode?.type === 'takeaway' && !s.takeawayEnabled) return { ok: false, reason: 'Online takeaway is paused at the moment.' };
  return { ok: true };
}

/* ---------- Shell ---------- */
function renderShell() {
  app.innerHTML = `
  <div class="c-shell">
    <header class="c-header">
      <a href="#/home" class="c-brand">${S.settings.logo ? `<img src="${esc(S.settings.logo)}" alt="">` : `<span class="brandmark">${esc((S.settings.name || 'S')[0])}</span>`}<span><b data-sname>${esc(S.settings.name)}</b><small data-sstatus></small></span></a>
      <button class="mode-chip" data-mode-chip></button>
    </header>
    <main class="c-main" id="c-main"></main>
    <button class="cart-bar" data-cartbar><span class="row gap-sm">${icon('shopping-bag', 20)}<span data-cb-text></span></span><span class="row gap-sm">View cart ${icon('arrow-right', 18)}</span></button>
    <nav class="c-nav" aria-label="Customer navigation">
      ${navItem('home', 'house', 'Home')}${navItem('menu', 'coffee', 'Menu')}${navItem('cart', 'shopping-bag', 'My Cart', true)}${navItem('orders', 'receipt-text', 'My Orders')}${navItem('help', 'circle-help', 'Help')}
    </nav>
  </div>`;
  app.querySelector('[data-mode-chip]').addEventListener('click', chooseMode);
  app.querySelector('[data-cartbar]').addEventListener('click', () => (location.hash = '#/cart'));
  route();
}
const navItem = (r, ic, label, badge = false) => `<a href="#/${r}" data-nav="${r}">${icon(ic, 22)}<span>${label}</span>${badge ? '<i class="c-badge" data-cart-count></i>' : ''}</a>`;

function refresh() {
  const s = S.settings;
  const open = storeOpenNow(s);
  const h = todayHours(s);
  const st = app.querySelector('[data-sstatus]');
  if (st) st.innerHTML = `<i class="dot ${open ? 'on' : ''}"></i>${open ? 'Open now' : 'Closed'}${h && !h.closed ? ` · ${fmt12(h.open)} – ${fmt12(h.close)}` : ''}`;
  const sn = app.querySelector('[data-sname]');
  if (sn) sn.textContent = s.name;
  const chip = app.querySelector('[data-mode-chip]');
  if (chip) chip.innerHTML = S.mode?.type === 'dine-in' ? `${icon('utensils', 16)} Table ${esc(S.mode.tableNumber)}` : S.mode?.type === 'takeaway' ? `${icon('shopping-bag', 16)} Takeaway` : `${icon('map-pin', 16)} Choose`;
  saveCart();
  route(true);
}

function chooseMode() {
  const s = S.settings;
  const { el, close } = openModal({
    title: 'How would you like to order?',
    size: 'sm',
    body: `<div class="col">
      <button class="mode-opt ${S.mode?.type === 'dine-in' ? 'active' : ''}" data-m="dine-in" ${s.dineInQrEnabled ? '' : 'disabled'}><span class="mi">${icon('utensils', 26)}</span><span><b>Dine-in</b><small>${S.mode?.type === 'dine-in' ? `Table ${esc(S.mode.tableNumber)}` : 'Scan the QR code on your table'}</small></span></button>
      <button class="mode-opt ${S.mode?.type === 'takeaway' ? 'active' : ''}" data-m="takeaway" ${s.takeawayEnabled ? '' : 'disabled'}><span class="mi">${icon('shopping-bag', 26)}</span><span><b>Takeaway / Tapau</b><small>Order ahead & pick up at the counter</small></span></button></div>
      <div class="field mt hidden" data-tbl><span class="label">Table number</span><div class="row"><input class="input grow" placeholder="e.g. 01" data-tnum><button class="btn btn-primary" data-tok>Continue</button></div><span class="tiny muted">Tip: scanning your table's QR code fills this automatically.</span></div>`,
  });
  el.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.m === 'takeaway') {
        setMode({ type: 'takeaway' });
        close();
        refresh();
      } else if (S.mode?.type === 'dine-in' && S.mode.valid) {
        close();
      } else {
        el.querySelector('[data-tbl]').classList.remove('hidden');
        el.querySelector('[data-tnum]').focus();
      }
    })
  );
  el.querySelector('[data-tok]').addEventListener('click', () => {
    const n = el.querySelector('[data-tnum]').value.trim().replace(/[^\w-]/g, '');
    if (!n) return;
    setMode({ type: 'dine-in', tableNumber: n });
    resolveTable();
    if (!S.mode.valid) return toast(`Table "${n}" not found.`, 'error');
    close();
    refresh();
  });
}

/* ---------- Router ---------- */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: name || 'home', arg: rest.join('/') };
}
let lastRoute = '';
function route(soft = false) {
  const main = document.getElementById('c-main');
  if (!main) return;
  const r = currentRoute();
  const key = r.name + '/' + r.arg;
  if (soft && key === lastRoute && ['checkout', 'track'].includes(r.name)) return; // keep form/tracker state
  const changed = key !== lastRoute;
  lastRoute = key;
  app.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name || (r.name === 'track' && a.dataset.nav === 'orders') || (r.name === 'checkout' && a.dataset.nav === 'cart')));
  cleanupView?.();
  cleanupView = null;
  const views = { home: viewHome, menu: viewMenu, cart: viewCart, checkout: viewCheckout, orders: viewOrders, track: viewTrack, help: viewHelp };
  const view = views[r.name] || viewHome;
  const scroll = main.scrollTop;
  main.innerHTML = `<div class="c-page ${changed ? 'page-enter' : ''}"></div>`;
  cleanupView = view(main.firstElementChild, r.arg) || null;
  if (changed) window.scrollTo(0, 0);
  else main.scrollTop = scroll;
  saveCart();
}
window.addEventListener('hashchange', () => route());
// order.html may run under a <base> (clean /order/table/01 URLs), which would make
// "#/menu" links resolve to the site root — keep in-page hash navigation local.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  location.hash = a.getAttribute('href');
});

/* ---------- Product UI ---------- */
function productCard(p, variant = 'grid') {
  const inCart = S.cart.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
  if (variant === 'row')
    return `<button class="p-row" data-p="${esc(p.id)}" ${p.soldOut ? 'disabled' : ''}>
      <div class="grow"><b>${esc(p.name)}</b><p>${esc(p.description || '')}</p><span class="price">${money(p.price)}</span>${p.soldOut ? ' <span class="badge tone-red">Sold out</span>' : ''}</div>
      <div class="p-row-img"><img src="${esc(productImage(p))}" alt="" loading="lazy">${p.soldOut ? '' : `<span class="add">${inCart ? `<b>${inCart}</b>` : icon('plus', 18)}</span>`}</div></button>`;
  return `<button class="p-card" data-p="${esc(p.id)}" ${p.soldOut ? 'disabled' : ''}>
    <div class="p-img"><img src="${esc(productImage(p))}" alt="" loading="lazy">${p.soldOut ? '<span class="badge tone-red">Sold out</span>' : ''}${inCart ? `<span class="in">${inCart}</span>` : ''}</div>
    <div class="p-body"><b>${esc(p.name)}</b><div class="row between"><span class="price">${money(p.price)}</span>${p.soldOut ? '' : `<span class="add">${icon('plus', 18)}</span>`}</div></div></button>`;
}
function bindProducts(root) {
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => openProduct(S.products.find((p) => p.id === b.dataset.p))));
}

function openProduct(p, line = null) {
  if (!p) return;
  const groups = p.optionGroups || [];
  const { el, close } = openModal({
    size: 'md',
    className: 'p-sheet',
    body: `<div class="ps-img"><img src="${esc(productImage(p))}" alt=""><button class="icon-btn ps-x" data-close aria-label="Close">${icon('x', 20)}</button></div>
      <div class="ps-body"><h2>${esc(p.name)}</h2><p class="muted">${esc(p.description || '')}</p><div class="price big">${money(p.price)}</div>
      <form data-f>${groups
        .map(
          (g, gi) => `<div class="opt-group"><h4>${esc(g.name)} <span class="badge ${g.required ? 'tone-blue' : ''}">${g.required ? 'Required' : 'Optional'}</span></h4><div class="c-opts">${g.options
            .map((o, oi) => {
              const checked = line ? line.options.some((x) => x.group === g.name && x.name === o.name) : g.required && oi === 0;
              return `<label class="c-opt"><input type="${g.type === 'multi' ? 'checkbox' : 'radio'}" name="g${gi}" value="${oi}" ${checked ? 'checked' : ''}><span class="c-opt-ui"></span><span class="grow">${esc(o.name)}</span>${o.price ? `<span class="muted small">${o.price > 0 ? '+' : '−'}${money(Math.abs(o.price))}</span>` : ''}</label>`;
            })
            .join('')}</div></div>`
        )
        .join('')}
        <label class="field"><span>Special instructions</span><textarea class="textarea" name="note" rows="2" maxlength="200" placeholder="e.g. less ice, no sugar">${esc(line?.note || '')}</textarea></label></form></div>`,
    footer: `<div class="qty big"><button type="button" data-dec aria-label="Decrease">${icon('minus', 18)}</button><b data-qty>${line?.qty || 1}</b><button type="button" data-inc aria-label="Increase">${icon('plus', 18)}</button></div>
      <button class="btn btn-primary btn-lg grow" data-ok>${line ? 'Update' : 'Add'} · <span data-price></span></button>`,
  });
  let qty = line?.qty || 1;
  const read = () => {
    const opts = [];
    groups.forEach((g, gi) => el.querySelectorAll(`[name="g${gi}"]:checked`).forEach((i) => opts.push({ group: g.name, name: g.options[i.value].name, price: Number(g.options[i.value].price) || 0 })));
    return opts;
  };
  const upd = () => {
    el.querySelector('[data-qty]').textContent = qty;
    el.querySelector('[data-price]').textContent = money(unitPrice(p, read()) * qty);
  };
  el.querySelector('[data-f]').addEventListener('change', upd);
  el.querySelector('[data-f]').addEventListener('submit', (e) => e.preventDefault());
  el.querySelector('[data-dec]').onclick = () => ((qty = Math.max(1, qty - 1)), upd());
  el.querySelector('[data-inc]').onclick = () => ((qty = Math.min(20, qty + 1)), upd());
  el.querySelector('[data-ok]').onclick = () => {
    const options = read();
    const miss = groups.find((g) => g.required && !options.some((o) => o.group === g.name));
    if (miss) return toast(`Please choose ${miss.name}.`, 'warning');
    const note = el.querySelector('[name=note]').value.trim();
    const price = unitPrice(p, options);
    if (line) Object.assign(line, { options, note, qty, price });
    else {
      const key = JSON.stringify([p.id, options, note]);
      const ex = S.cart.find((l) => JSON.stringify([l.productId, l.options, l.note]) === key);
      if (ex) ex.qty = Math.min(20, ex.qty + qty);
      else S.cart.push({ key: uid(8), productId: p.id, name: p.name, price, qty, options, note });
    }
    saveCart();
    close();
    toast(`${p.name} ${line ? 'updated' : 'added to cart'}`, 'success', { timeout: 1600 });
    route(true);
  };
  upd();
}

/* ---------- Views ---------- */
function viewHome(root) {
  const s = S.settings;
  const featured = S.products.filter((p) => p.featured);
  const popular = S.products.filter((p) => p.popular);
  const co = canOrder();
  root.innerHTML = `
    <section class="hero">
      <div class="hero-text"><span class="hero-kicker">${S.mode?.type === 'dine-in' ? `${icon('utensils', 14)} Dine-in · Table ${esc(S.mode.tableNumber)}` : S.mode?.type === 'takeaway' ? `${icon('shopping-bag', 14)} Takeaway` : 'Welcome'}</span>
        <h1>Welcome to ${esc(s.name)}</h1><p>${esc(s.welcome || s.tagline)}</p>
        <a class="btn btn-light" href="#/menu">Browse menu ${icon('arrow-right', 18)}</a></div>
      <span class="hero-art">${icon('coffee', 150)}</span>
    </section>
    ${!S.mode ? `<div class="mode-pick"><button class="mode-opt" data-pick="dine-in"><span class="mi">${icon('qr-code', 24)}</span><span><b>Dine-in</b><small>Scan table QR / enter table no.</small></span></button><button class="mode-opt" data-pick="takeaway"><span class="mi">${icon('shopping-bag', 24)}</span><span><b>Takeaway</b><small>Order ahead & pick up</small></span></button></div>` : ''}
    ${!co.ok ? `<div class="demo-banner tone-red mt">${icon('store', 16)} ${esc(co.reason)}</div>` : ''}
    <section class="c-sec"><div class="row between"><h3>Categories</h3></div>
      <div class="cat-tiles">${S.categories.map((c) => `<a class="cat-tile" href="#/menu" data-cat="${esc(c.id)}"><span>${icon(catIcon(c), 26)}</span>${esc(c.name)}</a>`).join('')}</div></section>
    ${featured.length ? `<section class="c-sec"><div class="row between"><h3>Featured drinks</h3><a href="#/menu" class="small bold">See all</a></div><div class="h-scroll">${featured.map((p) => productCard(p)).join('')}</div></section>` : ''}
    ${popular.length ? `<section class="c-sec"><div class="row between"><h3>Popular menu</h3></div><div class="p-list">${popular.map((p) => productCard(p, 'row')).join('')}</div></section>` : ''}
    <section class="c-sec"><div class="row between"><h3>Full catalog</h3><a href="#/menu" class="small bold">Open menu</a></div><div class="p-grid">${S.products.slice(0, 6).map((p) => productCard(p)).join('')}</div>
    ${S.products.length ? '' : emptyState({ iconName: 'coffee', title: 'Menu coming soon', text: 'Please check back shortly.' })}</section>`;
  bindProducts(root);
  root.querySelectorAll('[data-cat]').forEach((a) => a.addEventListener('click', () => (S.cat = a.dataset.cat)));
  root.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.pick === 'takeaway') {
        setMode({ type: 'takeaway' });
        refresh();
      } else chooseMode();
    })
  );
}
const catIcon = (c) => (/pastry|cake|food|donut/i.test(c.name) ? 'croissant' : /non|tea|matcha/i.test(c.name) ? 'leaf' : /signature|special/i.test(c.name) ? 'sparkles' : 'coffee');

function viewMenu(root) {
  root.innerHTML = `
    <div class="menu-head"><div class="input-icon">${icon('search', 18)}<input class="input" placeholder="Search drinks & food" data-q value="${esc(S.q)}"></div>
    <div class="chips" data-cats></div></div>
    <div data-list></div>`;
  const renderList = () => {
    root.querySelector('[data-cats]').innerHTML = [{ id: 'all', name: 'All' }, ...S.categories].map((c) => `<button class="chip ${S.cat === c.id ? 'active' : ''}" data-c="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    root.querySelectorAll('[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        S.cat = b.dataset.c;
        renderList();
      })
    );
    const q = S.q.toLowerCase();
    const list = S.products.filter((p) => (S.cat === 'all' || p.categoryId === S.cat) && (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)));
    const cats = S.cat === 'all' ? S.categories.filter((c) => list.some((p) => p.categoryId === c.id)) : S.categories.filter((c) => c.id === S.cat);
    const uncategorised = list.filter((p) => !S.categories.some((c) => c.id === p.categoryId));
    root.querySelector('[data-list]').innerHTML = list.length
      ? cats.map((c) => `<section class="c-sec"><h3>${esc(c.name)}</h3><div class="p-list">${list.filter((p) => p.categoryId === c.id).map((p) => productCard(p, 'row')).join('')}</div></section>`).join('') +
        (uncategorised.length ? `<section class="c-sec"><h3>More</h3><div class="p-list">${uncategorised.map((p) => productCard(p, 'row')).join('')}</div></section>` : '')
      : emptyState({ iconName: 'search-x', title: 'Nothing found', text: 'Try another search or category.' });
    bindProducts(root);
  };
  root.querySelector('[data-q]').addEventListener(
    'input',
    debounce((e) => {
      S.q = e.target.value.trim();
      renderList();
    }, 150)
  );
  renderList();
}

function viewCart(root) {
  if (!S.cart.length) {
    root.innerHTML = emptyState({ iconName: 'shopping-bag', title: 'Your cart is empty', text: 'Add your favourite drinks and treats to get started.', action: `<a class="btn btn-primary btn-lg" href="#/menu">Browse menu</a>` });
    return;
  }
  const t = totals();
  const s = S.settings;
  const co = canOrder();
  root.innerHTML = `
    <h2 class="c-title">My Cart</h2>
    <div class="mode-banner">${S.mode?.type === 'dine-in' ? `${icon('utensils', 18)} Dine-in · <b>Table ${esc(S.mode.tableNumber)}</b>` : S.mode?.type === 'takeaway' ? `${icon('shopping-bag', 18)} <b>Takeaway</b> · pick up at counter` : `${icon('map-pin', 18)} Choose dine-in or takeaway`}<button class="btn btn-sm btn-ghost" data-change>Change</button></div>
    <div class="c-card">${S.cart
      .map(
        (l) => `<div class="c-line"><img src="${esc(productImage(S.products.find((p) => p.id === l.productId) || { name: l.name }))}" alt="">
        <div class="grow"><button class="link-btn" data-edit="${l.key}"><b>${esc(l.name)}</b></button>
          ${l.options.length ? `<div class="small muted">${esc(l.options.map((o) => o.name).join(' · '))}</div>` : ''}
          ${l.note ? `<div class="small" style="color:var(--amber)">“${esc(l.note)}”</div>` : ''}
          <div class="row between mt"><b class="price">${money(l.price * l.qty)}</b>
          <div class="qty"><button data-dec="${l.key}" aria-label="Decrease">${icon(l.qty === 1 ? 'trash-2' : 'minus', 15)}</button><b>${l.qty}</b><button data-inc="${l.key}" aria-label="Increase">${icon('plus', 15)}</button></div></div></div></div>`
      )
      .join('')}
      <a href="#/menu" class="btn btn-ghost btn-block mt">${icon('plus', 18)} Add more items</a></div>
    <div class="c-card"><div class="totals">
      <div class="row"><span class="muted">Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.service ? `<div class="row"><span class="muted">Service charge (${s.serviceRate}%)</span><span>${money(t.service)}</span></div>` : ''}
      ${t.tax ? `<div class="row"><span class="muted">${esc(s.taxLabel)} (${s.taxRate}%)</span><span>${money(t.tax)}</span></div>` : ''}
      <div class="row grand"><span>Total payment</span><span>${money(t.total)}</span></div></div></div>
    ${!co.ok && !co.allowSchedule ? `<div class="demo-banner tone-red">${icon('store', 16)} ${esc(co.reason)}</div>` : ''}
    <div class="sticky-cta"><button class="btn btn-primary btn-lg btn-block" data-checkout ${co.ok || co.allowSchedule ? '' : 'disabled'}>CHECKOUT · ${money(t.total)}</button></div>`;
  root.querySelector('[data-change]').onclick = chooseMode;
  root.querySelectorAll('[data-inc],[data-dec]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = S.cart.find((x) => x.key === (b.dataset.inc || b.dataset.dec));
      l.qty += b.dataset.inc ? 1 : -1;
      if (l.qty <= 0) S.cart = S.cart.filter((x) => x !== l);
      saveCart();
      route(true);
    })
  );
  root.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = S.cart.find((x) => x.key === b.dataset.edit);
      openProduct(
        S.products.find((p) => p.id === l.productId),
        l
      );
    })
  );
  root.querySelector('[data-checkout]').onclick = () => {
    if (!S.mode) return chooseMode();
    location.hash = '#/checkout';
  };
}

function timeSlots(dateStr) {
  const s = S.settings;
  const d = new Date(dateStr + 'T00:00');
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
  const h = s.storeMode === 'open' ? { open: '00:00', close: '23:59' } : s.hours[day];
  if (s.storeMode === 'closed' || !h || h.closed) return [];
  const [oh, om] = h.open.split(':').map(Number);
  const [ch, cm] = h.close.split(':').map(Number);
  const earliest = Date.now() + (s.prepMinutes || 15) * 60000;
  const out = [];
  for (let m = oh * 60 + om; m <= ch * 60 + cm - 10; m += 15) {
    const t = new Date(d);
    t.setHours(Math.floor(m / 60), m % 60, 0, 0);
    if (t.getTime() >= earliest) out.push(t);
  }
  return out;
}

function viewCheckout(root) {
  if (!S.cart.length) return (location.hash = '#/cart');
  if (!S.mode) {
    location.hash = '#/cart';
    return;
  }
  const s = S.settings;
  const t = totals();
  const takeaway = S.mode.type === 'takeaway';
  const prof = safeGet(PROFILE_KEY, {});
  const methods = s.paymentMethods.filter((m) => m.enabled && m.customer);
  let method = methods[0]?.id;
  const dates = Array.from({ length: 3 }, (_, i) => isoDate(addDays(new Date(), i)));
  root.innerHTML = `
    <a href="#/cart" class="back-link">${icon('arrow-left', 18)} Back to cart</a>
    <h2 class="c-title">Checkout</h2>
    <form class="col gap-lg" data-f novalidate>
      <div class="c-card"><h3 class="c-card-title">${icon(takeaway ? 'shopping-bag' : 'utensils', 18)} ${takeaway ? 'Takeaway details' : `Dine-in · Table ${esc(S.mode.tableNumber)}`}</h3>
        <div class="form">
          <label class="field"><span>Your name ${takeaway ? '*' : '(optional)'}</span><input class="input" name="name" maxlength="80" autocomplete="name" value="${esc(prof.name || '')}" ${takeaway ? 'required' : ''}></label>
          <label class="field"><span>Phone number ${takeaway ? '*' : '(optional, for order updates)'}</span><input class="input" name="phone" inputmode="tel" autocomplete="tel" placeholder="012-345 6789" value="${esc(prof.phone || '')}" ${takeaway ? 'required' : ''}></label>
          ${
            takeaway
              ? `<div class="form-grid"><label class="field"><span>Pickup date *</span><select class="select" name="date">${dates.map((d, i) => `<option value="${d}">${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d + 'T00:00').toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}</option>`).join('')}</select></label>
                <label class="field"><span>Pickup time *</span><select class="select" name="time"></select></label></div>
                <p class="tiny muted">Ready in about ${s.prepMinutes || 15} minutes after we confirm.</p>`
              : ''
          }
          <label class="field"><span>Special instructions</span><textarea class="textarea" name="note" rows="2" maxlength="300" placeholder="Allergies, requests…">${esc(S.note)}</textarea></label>
        </div></div>
      <div class="c-card"><h3 class="c-card-title">${icon('wallet', 18)} Payment</h3>
        ${methods.length ? `<div class="col" data-methods>${methods.map((m) => `<label class="c-opt pay"><input type="radio" name="pm" value="${esc(m.id)}" ${m.id === method ? 'checked' : ''}><span class="c-opt-ui"></span><span class="mi">${icon(m.type === 'cash' ? 'banknote' : m.type === 'qr' ? 'qr-code' : m.type === 'transfer' ? 'landmark' : 'credit-card', 20)}</span><span class="grow"><b>${esc(m.type === 'cash' ? 'Cash at Counter' : m.name)}</b></span></label>`).join('')}</div>
        <div class="pay-info mt" data-payinfo></div>` : `<p class="muted">Please pay at the counter.</p>`}
      </div>
      <div class="c-card"><h3 class="c-card-title">${icon('receipt', 18)} Order summary</h3>
        ${S.cart.map((l) => `<div class="row between small" style="padding:4px 0"><span>${l.qty}× ${esc(l.name)}${l.options.length ? ` <span class="muted">(${esc(l.options.map((o) => o.name).join(', '))})</span>` : ''}</span><span class="tnum">${money(l.price * l.qty)}</span></div>`).join('')}
        <hr class="divider"><div class="totals">
        ${t.service ? `<div class="row"><span class="muted">Service charge</span><span>${money(t.service)}</span></div>` : ''}${t.tax ? `<div class="row"><span class="muted">${esc(s.taxLabel)}</span><span>${money(t.tax)}</span></div>` : ''}
        <div class="row grand"><span>Total</span><span>${money(t.total)}</span></div></div></div>
      <div class="sticky-cta"><button class="btn btn-success btn-lg btn-block" type="submit">${icon('check', 20)} Place order · ${money(t.total)}</button></div>
    </form>`;
  const f = root.querySelector('[data-f]');
  const fillTimes = () => {
    if (!takeaway) return;
    const slots = timeSlots(f.date.value);
    f.time.innerHTML = slots.length ? slots.map((d) => `<option value="${pad(d.getHours())}:${pad(d.getMinutes())}">${fmtTime(d.getTime())}</option>`).join('') : '<option value="">Closed — choose another day</option>';
  };
  if (takeaway) {
    f.date.addEventListener('change', fillTimes);
    fillTimes();
    if (!timeSlots(f.date.value).length && timeSlots(dates[1]).length) {
      f.date.value = dates[1];
      fillTimes();
    }
  }
  const payInfo = () => {
    const m = methods.find((x) => x.id === method);
    const box = root.querySelector('[data-payinfo]');
    if (!box || !m) return;
    box.innerHTML = `${m.instructions ? `<p class="small">${esc(m.instructions)}</p>` : ''}
      ${m.type === 'qr' ? (m.qrImage ? `<img src="${esc(m.qrImage)}" alt="DuitNow QR" class="duitnow">` : `<p class="small muted">The cashier will show you the DuitNow QR.</p>`) : ''}
      ${m.type === 'transfer' && (m.bank || m.accountNo) ? `<div class="bank"><div><span class="muted small">Bank</span><b>${esc(m.bank || '—')}</b></div><div><span class="muted small">Account name</span><b>${esc(m.accountName || '—')}</b></div><div><span class="muted small">Account no.</span><b class="mono">${esc(m.accountNo || '—')}</b></div><div><span class="muted small">Amount</span><b>${money(t.total)}</b></div></div>` : ''}
      ${m.type === 'qr' || m.type === 'transfer' ? `<label class="field mt"><span>Transaction reference</span><input class="input" name="ref" maxlength="80" placeholder="Enter after paying (optional now)"></label><p class="tiny muted">${icon('shield-check', 12)} Your order is marked <b>Verifying</b> until our staff confirm the payment.</p>` : ''}`;
  };
  root.querySelectorAll('[name=pm]').forEach((r) =>
    r.addEventListener('change', () => {
      method = r.value;
      payInfo();
    })
  );
  payInfo();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const co = canOrder();
    if (!co.ok && !(takeaway && co.allowSchedule)) return toast(co.reason, 'error');
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    let err = '';
    if (takeaway && !name) err = 'Please enter your name.';
    else if ((takeaway || phone) && !validPhone(phone)) err = 'Please enter a valid phone number.';
    f.name.classList.toggle('invalid', takeaway && !name);
    f.phone.classList.toggle('invalid', (takeaway || phone) && !validPhone(phone));
    let pickupAt = null;
    if (!err && takeaway) {
      if (!f.time.value) err = 'Please choose an available pickup time.';
      else pickupAt = new Date(`${f.date.value}T${f.time.value}`).getTime();
    }
    if (!err && !storeOpenNow(S.settings) && takeaway && pickupAt && pickupAt < Date.now() + 30 * 60000) err = 'We are closed now — please choose a later pickup time.';
    if (err) return toast(err, 'error');
    const m = methods.find((x) => x.id === method);
    const ref = f.ref?.value.trim() || '';
    const btn = f.querySelector('[type=submit]');
    await withBusy(btn, async () => {
      try {
        // Re-validate prices against the live menu right before submitting.
        syncCart();
        if (!S.cart.length) throw new Error('Your cart is empty.');
        const order = await createOrder(
          {
            source: takeaway ? 'online' : 'qr',
            type: S.mode.type,
            tableId: takeaway ? '' : S.mode.tableId,
            tableNumber: takeaway ? '' : S.mode.tableNumber,
            customer: { name, phone },
            items: S.cart.map(({ key, ...l }) => l),
            note: f.note.value.trim(),
            pickupAt,
            paymentMethod: m?.id || 'cash',
            paymentStatus: m && (m.type === 'qr' || m.type === 'transfer') ? 'pending_verification' : 'unpaid',
            paymentRef: ref,
          },
          S.settings
        );
        safeSet(PROFILE_KEY, { name, phone });
        const mine = safeGet(ORDERS_KEY, []);
        mine.unshift({ id: order.id, orderNo: order.orderNo, createdAt: order.createdAt });
        safeSet(ORDERS_KEY, mine.slice(0, 30));
        S.cart = [];
        S.note = '';
        saveCart();
        location.hash = `#/track/${order.orderNo}`;
        toast('Order placed! We have received your order.', 'success', { title: order.orderNo });
      } catch (ex) {
        console.error(ex);
        toast(ex.message?.includes('permission') ? 'Ordering is unavailable right now. Please order at the counter.' : ex.message, 'error');
      }
    });
  });
}

const STEPS = [
  ['new', 'Order Received', 'receipt-text'],
  ['confirmed', 'Confirmed', 'circle-check'],
  ['preparing', 'Preparing', 'chef-hat'],
  ['ready', 'Ready', 'bell'],
  ['completed', 'Completed', 'check-check'],
];

function viewTrack(root, orderNo) {
  orderNo = decodeURIComponent(orderNo || '').toUpperCase();
  root.innerHTML = `<div class="c-card">${'<div class="skeleton" style="height:18px;margin-bottom:12px"></div>'.repeat(4)}</div>`;
  const unsub = store.watchDoc('orderStatus', orderNo, (o) => {
    if (!o) {
      root.innerHTML = `<a href="#/orders" class="back-link">${icon('arrow-left', 18)} My orders</a>${emptyState({ iconName: 'search-x', title: 'Order not found', text: `We couldn't find ${orderNo}. Check the order number and try again.` })}`;
      return;
    }
    const s = S.settings;
    const idx = STEPS.findIndex((x) => x[0] === o.status);
    const cancelled = o.status === 'cancelled';
    const ready = o.status === 'ready';
    const at = (st) => o.history?.find((h) => h.status === st)?.at;
    const pct = cancelled ? 0 : Math.max(0, idx) / (STEPS.length - 1);
    root.innerHTML = `
      <a href="#/orders" class="back-link">${icon('arrow-left', 18)} My orders</a>
      <div class="track-hero ${cancelled ? 'cancelled' : ready ? 'ready' : ''}">
        <span class="small">Order number</span><h2>${esc(o.orderNo)}</h2>
        <p>${cancelled ? 'This order was cancelled. Please speak to our staff if you have questions.' : ready ? (o.type === 'dine-in' ? 'Your order is ready — we\'ll bring it to your table!' : 'Your order is ready for pickup at the counter! 🎉') : o.status === 'completed' ? 'Enjoy! Thank you for ordering with us.' : `We're on it. ${o.type === 'takeaway' && o.pickupAt ? `Pickup at ${fmtTime(o.pickupAt)}.` : `Estimated ${s.prepMinutes || 15} min.`}`}</p>
        <div class="row gap-sm wrap"><span class="badge tone-${o.type === 'dine-in' ? 'indigo' : 'blue'}">${o.type === 'dine-in' ? `Table ${esc(o.tableNumber)}` : 'Takeaway'}</span><span class="badge tone-${PAYMENT_META[o.paymentStatus]?.tone}">${esc(PAYMENT_META[o.paymentStatus]?.label)}</span></div>
      </div>
      ${
        cancelled
          ? ''
          : `<div class="c-card"><div class="tracker" style="--pct:${pct}">
        <div class="tracker-line"><span></span></div>
        ${STEPS.map(([st, label, ic], i) => `<div class="t-step ${i < idx ? 'done' : i === idx ? 'current' : ''}"><span class="t-dot">${icon(i < idx ? 'check' : ic, 18)}</span><div><b>${label}</b><small>${at(st) ? fmtTime(at(st)) : i === idx + 1 ? 'Up next' : ''}</small></div></div>`).join('')}
      </div></div>`
      }
      ${o.paymentStatus === 'pending_verification' ? `<div class="demo-banner mt">${icon('hourglass', 16)} Payment is being verified by our staff.</div>` : o.paymentStatus === 'unpaid' && !cancelled ? `<div class="demo-banner tone-blue mt">${icon('wallet', 16)} Payment due: <b>${money(o.total)}</b> · ${o.type === 'dine-in' ? 'pay at the counter before you leave' : 'pay at the counter when you collect'}</div>` : ''}
      <div class="c-card"><h3 class="c-card-title">${icon('receipt', 18)} Order summary</h3>
        ${(o.items || []).map((i) => `<div class="row between small" style="padding:4px 0"><span>${i.qty}× ${esc(i.name)}</span></div>`).join('')}
        <hr class="divider"><div class="row between"><b>Total</b><b class="tnum">${money(o.total)}</b></div>
        <p class="tiny muted mt">Placed ${esc(fmtDateTime(o.createdAt))}${o.pickupAt ? ` · Pickup ${esc(fmtDateTime(o.pickupAt))}` : ''}</p></div>
      <div class="row mt"><button class="btn btn-outline grow" data-share>${icon('share-2', 18)} Share</button><a href="#/menu" class="btn btn-soft grow">${icon('plus', 18)} Order more</a></div>`;
    root.querySelector('[data-share]').onclick = async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: `${s.name} order ${o.orderNo}`, url });
        else {
          await navigator.clipboard.writeText(url);
          toast('Tracking link copied.', 'success');
        }
      } catch {
        /* cancelled */
      }
    };
  });
  return unsub;
}

function viewOrders(root) {
  const mine = safeGet(ORDERS_KEY, []);
  root.innerHTML = `
    <h2 class="c-title">My Orders</h2>
    <form class="c-card row" data-track><input class="input grow" name="no" placeholder="Track order no. e.g. TAP-20261112-001" style="text-transform:uppercase"><button class="btn btn-primary">${icon('search', 18)}</button></form>
    <div data-list>${mine.length ? '' : emptyState({ iconName: 'receipt-text', title: 'No orders yet', text: 'Orders you place on this device appear here so you can track them.', action: `<a class="btn btn-primary" href="#/menu">Start ordering</a>` })}</div>`;
  root.querySelector('[data-track]').addEventListener('submit', (e) => {
    e.preventDefault();
    const no = e.target.no.value.trim().toUpperCase();
    if (!/^TAP-\d{8}-\d{3,}$/.test(no)) return toast('Order numbers look like TAP-20261112-001.', 'warning');
    location.hash = `#/track/${no}`;
  });
  const list = root.querySelector('[data-list]');
  const unsubs = [];
  if (mine.length) {
    list.innerHTML = mine.map((m) => `<a class="c-card order-card" href="#/track/${esc(m.orderNo)}" data-no="${esc(m.orderNo)}"><div class="grow"><b>${esc(m.orderNo)}</b><div class="small muted">${esc(fmtDateTime(m.createdAt))}</div></div><span data-st class="badge">…</span>${icon('chevron-right', 18)}</a>`).join('');
    mine.forEach((m) =>
      unsubs.push(
        store.watchDoc('orderStatus', m.orderNo, (o) => {
          const el = list.querySelector(`[data-no="${CSS.escape(m.orderNo)}"] [data-st]`);
          if (!el) return;
          if (!o) {
            el.textContent = 'Unavailable';
            return;
          }
          el.className = `badge tone-${STATUS_META[o.status]?.tone}`;
          el.textContent = STATUS_META[o.status]?.label === 'New Order' ? 'Received' : STATUS_META[o.status]?.label;
        })
      )
    );
  }
  return () => unsubs.forEach((u) => u());
}

function viewHelp(root) {
  const s = S.settings;
  const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  root.innerHTML = `
    <h2 class="c-title">Help</h2>
    <div class="c-card"><h3 class="c-card-title">${icon('list-ordered', 18)} How to order</h3>
      <ol class="help-steps"><li><b>Scan</b> the QR on your table (dine-in) or choose Takeaway.</li><li><b>Browse</b> the menu and add items to your cart.</li><li><b>Checkout</b> — no account needed. Choose how you'd like to pay.</li><li><b>Track</b> your order live until it's ready.</li></ol></div>
    <div class="c-card"><h3 class="c-card-title">${icon('clock', 18)} Opening hours</h3>
      ${days.map(([k, l]) => `<div class="row between small" style="padding:4px 0"><span>${l}</span><span>${s.hours[k].closed ? 'Closed' : `${fmt12(s.hours[k].open)} – ${fmt12(s.hours[k].close)}`}</span></div>`).join('')}</div>
    <div class="c-card"><h3 class="c-card-title">${icon('wallet', 18)} Payment</h3>
      <p class="small">We accept ${s.paymentMethods.filter((m) => m.enabled && m.customer).map((m) => esc(m.type === 'cash' ? 'cash at the counter' : m.name)).join(', ')}. Online payments are verified by our staff before they are marked as paid.</p></div>
    <div class="c-card"><h3 class="c-card-title">${icon('store', 18)} ${esc(s.name)}</h3>
      ${s.address ? `<p class="small">${icon('map-pin', 14)} ${esc(s.address)}</p>` : ''}
      <div class="row wrap mt">${s.phone ? `<a class="btn btn-outline" href="tel:${esc(s.phone)}">${icon('phone', 18)} Call us</a><a class="btn btn-outline" href="https://wa.me/6${esc(normalizePhone(s.phone))}" target="_blank" rel="noopener">${icon('message-circle', 18)} WhatsApp</a>` : '<p class="small muted">Please ask our friendly staff at the counter.</p>'}</div></div>
    <p class="center tiny muted mt">Powered by TAPJERR.io · Smart Ordering. Seamless Business.</p>`;
}

boot();
setInterval(() => app.querySelector('.c-shell') && refresh(), 60000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const swUrl = new URL('sw.js', document.baseURI).href;
  navigator.serviceWorker.register(swUrl).catch(() => {});
}

export { round2 };
