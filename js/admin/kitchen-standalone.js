// TAPJERR.io — standalone, tablet-optimised Kitchen Display (kitchen.html)
import { initStore, store, withDefaults } from '../core/store.js';
import { icon } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { renderKDS } from './pages/kitchen.js';

const app = document.getElementById('app');

function createLive() {
  const listeners = new Map();
  const ready = new Set();
  const live = {
    data: { settings: withDefaults(null), orders: [] },
    get settings() {
      return this.data.settings;
    },
    get orders() {
      return this.data.orders;
    },
    on(keys, cb) {
      const list = [].concat(keys);
      const fn = () => cb(live);
      list.forEach((k) => (listeners.get(k) || listeners.set(k, new Set()).get(k)).add(fn));
      if (list.every((k) => ready.has(k))) queueMicrotask(fn);
      return () => list.forEach((k) => listeners.get(k)?.delete(fn));
    },
    set(k, v) {
      this.data[k] = v;
      ready.add(k);
      listeners.get(k)?.forEach((fn) => fn());
    },
  };
  return live;
}

(async () => {
  await initStore();
  let stop = [];
  store.auth.onChange(async (user) => {
    stop.forEach((u) => u());
    stop = [];
    if (!user) {
      app.innerHTML = `<div class="kds"><div class="kds-empty"><div class="empty-art">${icon('lock', 40)}</div><h3>Sign in required</h3><p>Sign in with a kitchen or admin account to open the Kitchen Display.</p><a class="btn btn-primary mt" href="admin.html#/kitchen">Sign in</a></div></div>`;
      return;
    }
    const profile = await store.get('staff', user.uid);
    if (!profile || profile.active === false) {
      app.innerHTML = `<div class="kds"><div class="kds-empty"><h3>No access</h3><p>${esc(user.email)} is not an active staff account.</p></div></div>`;
      return;
    }
    const live = createLive();
    stop.push(store.watchDoc('settings', 'store', (s) => live.set('settings', withDefaults(s))));
    stop.push(
      store.watch('orders', (o) => live.set('orders', o.sort((a, b) => b.createdAt - a.createdAt)), { since: Date.now() - 2 * 86400000 })
    );
    const extra = `<a class="btn btn-sm" style="background:#181d48;color:#fff" href="admin.html" title="Back to dashboard">${icon('layout-dashboard', 18)}</a>
      <button class="btn btn-sm" style="background:#181d48;color:#fff" data-out title="Sign out">${icon('log-out', 18)}</button>`;
    stop.push(renderKDS(app, { live, user: profile, embedded: false, extraHead: extra }));
    app.querySelector('[data-out]').onclick = () => store.auth.signOut();
    // Keep the tablet awake while the KDS is open.
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (lock) stop.push(() => lock.release());
    } catch {
      /* not supported */
    }
  });
})();
