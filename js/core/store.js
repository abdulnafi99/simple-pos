// TAPJERR.io — data store facade. Picks Cloud (Firebase) or Demo (local) backend.
import { isCloudMode } from './config.js';
import { createLocalBackend } from './store-local.js';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_PRODUCTS, DEFAULT_TABLES, DEFAULT_INVENTORY, DEFAULT_SUPPLIERS } from './seed.js';

let backend = null;
let initPromise = null;

export function initStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (isCloudMode()) {
      try {
        const { createFirebaseBackend } = await import('./store-firebase.js');
        backend = await createFirebaseBackend();
      } catch (e) {
        console.error('[TAPJERR] Firebase failed to load, falling back to Demo Mode.', e);
        backend = createLocalBackend();
        backend.fallbackReason = e?.message || 'Firebase unavailable';
      }
    } else {
      backend = createLocalBackend();
    }
    await backend.init();
    return backend;
  })();
  return initPromise;
}

/** Proxy so modules can `import { store }` before init resolves. */
export const store = new Proxy(
  {},
  {
    get(_, prop) {
      if (!backend) throw new Error('Store not initialised — call initStore() first.');
      return backend[prop];
    },
  }
);

/** Merge stored settings over defaults so new settings keys always exist. */
export function withDefaults(s) {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!s) return d;
  return {
    ...d,
    ...s,
    hours: { ...d.hours, ...(s.hours || {}) },
    receipt: { ...d.receipt, ...(s.receipt || {}) },
    paymentMethods: s.paymentMethods?.length ? s.paymentMethods : d.paymentMethods,
    discountPresets: s.discountPresets || d.discountPresets,
  };
}

/** Cloud Mode first run: write the Selagi Coffee starter menu/tables/settings. */
export async function seedCloudDefaults() {
  const ops = [];
  ops.push({ col: 'settings', id: 'store', data: structuredClone(DEFAULT_SETTINGS) });
  DEFAULT_CATEGORIES.forEach((c) => ops.push({ col: 'categories', id: c.id, data: c }));
  DEFAULT_PRODUCTS.forEach((p) => ops.push({ col: 'products', id: p.id, data: { ...p, createdAt: Date.now() } }));
  DEFAULT_TABLES.forEach((t) => ops.push({ col: 'tables', id: t.id, data: t }));
  DEFAULT_INVENTORY.forEach((i) => ops.push({ col: 'inventory', id: i.id, data: i }));
  DEFAULT_SUPPLIERS.forEach((s) => ops.push({ col: 'suppliers', id: s.id, data: s }));
  await backend.batch(ops);
}
