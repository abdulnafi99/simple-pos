// TAPJERR.io — Demo Mode backend.
// Persists to localStorage and syncs live across every tab/window on this device
// (storage events + BroadcastChannel), so the customer page, POS and kitchen
// screen update each other in real time without any server.
import { uid, sha256, fileToDataURL } from './utils.js';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES, DEFAULT_PRODUCTS, DEFAULT_TABLES, DEFAULT_INVENTORY, DEFAULT_SUPPLIERS, DEMO_STAFF } from './seed.js';

const PREFIX = 'tapjerr:v1:';
const SESSION_KEY = PREFIX + '_session';
const SEED_KEY = PREFIX + '_seeded';

export function createLocalBackend() {
  const watchers = new Map(); // collection -> Set<fn>
  const docWatchers = new Map(); // `${col}/${id}` -> Set<fn>
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('tapjerr-sync') : null;
  let authListeners = new Set();
  let currentUser = null;

  const keyOf = (col) => PREFIX + col;
  function readCol(col) {
    try {
      return JSON.parse(localStorage.getItem(keyOf(col)) || '{}');
    } catch {
      return {};
    }
  }
  function writeCol(col, map) {
    try {
      localStorage.setItem(keyOf(col), JSON.stringify(map));
    } catch (e) {
      if (e?.name === 'QuotaExceededError') throw new Error('Browser storage is full. Remove some product photos or connect Firebase.');
      throw e;
    }
    notify(col, true);
  }
  function notify(col, broadcast) {
    const map = readCol(col);
    const list = Object.values(map);
    watchers.get(col)?.forEach((fn) => fn(list));
    for (const [k, set] of docWatchers) {
      if (k.startsWith(col + '/')) {
        const id = k.slice(col.length + 1);
        set.forEach((fn) => fn(map[id] || null));
      }
    }
    if (broadcast) channel?.postMessage({ col });
  }
  channel && (channel.onmessage = (e) => e.data?.col && notify(e.data.col, false));
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(PREFIX)) return;
    if (e.key === SESSION_KEY) return restoreSession();
    const col = e.key.slice(PREFIX.length);
    if (!col.startsWith('_')) notify(col, false);
  });

  const applyFilter = (list, opts = {}) => {
    let out = list;
    if (opts.since) out = out.filter((x) => (x.createdAt || 0) >= opts.since);
    if (opts.until) out = out.filter((x) => (x.createdAt || 0) <= opts.until);
    if (opts.where) out = out.filter((x) => opts.where.every(([f, op, v]) => cmp(x[f], op, v)));
    return out;
  };
  const cmp = (a, op, b) => (op === '==' ? a === b : op === 'in' ? b.includes(a) : op === '!=' ? a !== b : op === '>=' ? a >= b : op === '<=' ? a <= b : true);

  async function seedIfNeeded() {
    if (localStorage.getItem(SEED_KEY)) return;
    const put = (col, arr) => writeCol(col, Object.fromEntries(arr.map((x) => [x.id, x])));
    put('settings', [{ id: 'store', ...structuredClone(DEFAULT_SETTINGS) }]);
    put('categories', DEFAULT_CATEGORIES);
    put('products', DEFAULT_PRODUCTS.map((p) => ({ ...p, createdAt: Date.now() })));
    put('tables', DEFAULT_TABLES);
    put('inventory', DEFAULT_INVENTORY);
    put('suppliers', DEFAULT_SUPPLIERS);
    const accounts = {};
    const staff = {};
    for (const s of DEMO_STAFF) {
      const id = 'u_' + s.role;
      accounts[s.email] = { uid: id, email: s.email, hash: await sha256(s.password + ':' + s.email) };
      staff[id] = { id, name: s.name, email: s.email, role: s.role, active: true, createdAt: Date.now(), demoAccount: true };
    }
    localStorage.setItem(PREFIX + '_accounts', JSON.stringify(accounts));
    writeCol('staff', staff);
    localStorage.setItem(SEED_KEY, '1');
  }

  function restoreSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      const staff = s ? readCol('staff')[s.uid] : null;
      currentUser = staff && staff.active !== false ? { uid: staff.id, email: staff.email } : null;
    } catch {
      currentUser = null;
    }
    authListeners.forEach((fn) => fn(currentUser));
  }

  const backend = {
    mode: 'demo',
    async init() {
      await seedIfNeeded();
      restoreSession();
    },

    watch(col, cb, opts = {}) {
      const fn = (list) => cb(applyFilter(list, opts));
      if (!watchers.has(col)) watchers.set(col, new Set());
      watchers.get(col).add(fn);
      queueMicrotask(() => fn(Object.values(readCol(col))));
      return () => watchers.get(col)?.delete(fn);
    },
    watchDoc(col, id, cb) {
      const k = `${col}/${id}`;
      if (!docWatchers.has(k)) docWatchers.set(k, new Set());
      docWatchers.get(k).add(cb);
      queueMicrotask(() => cb(readCol(col)[id] || null));
      return () => docWatchers.get(k)?.delete(cb);
    },
    async get(col, id) {
      return readCol(col)[id] || null;
    },
    async list(col, opts = {}) {
      return applyFilter(Object.values(readCol(col)), opts);
    },
    async add(col, data) {
      const id = data.id || uid();
      const map = readCol(col);
      map[id] = { ...data, id };
      writeCol(col, map);
      return id;
    },
    async set(col, id, data, { merge = false } = {}) {
      const map = readCol(col);
      map[id] = merge ? { ...(map[id] || {}), ...data, id } : { ...data, id };
      writeCol(col, map);
      return id;
    },
    async update(col, id, patch) {
      const map = readCol(col);
      if (!map[id]) throw new Error('Record not found.');
      map[id] = { ...map[id], ...patch, id };
      writeCol(col, map);
    },
    async remove(col, id) {
      const map = readCol(col);
      delete map[id];
      writeCol(col, map);
    },
    /** Write several docs at once (single notification per collection). */
    async batch(ops) {
      const touched = new Map();
      for (const op of ops) {
        if (!touched.has(op.col)) touched.set(op.col, readCol(op.col));
        const map = touched.get(op.col);
        if (op.type === 'delete') delete map[op.id];
        else if (op.type === 'update') map[op.id] = { ...(map[op.id] || {}), ...op.data, id: op.id };
        else map[op.id] = { ...op.data, id: op.id };
      }
      for (const [col, map] of touched) writeCol(col, map);
    },
    async nextCounter(name) {
      // localStorage is synchronous so this read-modify-write cannot interleave within one tab.
      const map = readCol('counters');
      const n = (map[name]?.n || 0) + 1;
      map[name] = { id: name, n };
      writeCol('counters', map);
      return n;
    },
    async uploadImage(file) {
      return fileToDataURL(file, 640, 0.8);
    },
    async resetAll() {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    },

    auth: {
      get current() {
        return currentUser;
      },
      onChange(fn) {
        authListeners.add(fn);
        queueMicrotask(() => fn(currentUser));
        return () => authListeners.delete(fn);
      },
      async signIn(email, password) {
        email = email.trim().toLowerCase();
        const accounts = JSON.parse(localStorage.getItem(PREFIX + '_accounts') || '{}');
        const acc = accounts[email];
        if (!acc || acc.hash !== (await sha256(password + ':' + email))) throw new Error('Incorrect email or password.');
        const staff = readCol('staff')[acc.uid];
        if (!staff || staff.active === false) throw new Error('This account has been deactivated.');
        localStorage.setItem(SESSION_KEY, JSON.stringify({ uid: acc.uid, at: Date.now() }));
        restoreSession();
        return currentUser;
      },
      async signOut() {
        localStorage.removeItem(SESSION_KEY);
        restoreSession();
      },
      async createAccount(email, password, profile) {
        email = email.trim().toLowerCase();
        const accounts = JSON.parse(localStorage.getItem(PREFIX + '_accounts') || '{}');
        if (accounts[email]) throw new Error('An account with this email already exists.');
        const id = 'u_' + uid(10);
        accounts[email] = { uid: id, email, hash: await sha256(password + ':' + email) };
        localStorage.setItem(PREFIX + '_accounts', JSON.stringify(accounts));
        await backend.set('staff', id, { ...profile, id, email, active: true, createdAt: Date.now() });
        return id;
      },
      async changePassword(email, password) {
        email = email.trim().toLowerCase();
        const accounts = JSON.parse(localStorage.getItem(PREFIX + '_accounts') || '{}');
        if (!accounts[email]) throw new Error('Account not found.');
        accounts[email].hash = await sha256(password + ':' + email);
        localStorage.setItem(PREFIX + '_accounts', JSON.stringify(accounts));
      },
      async sendReset() {
        throw new Error('Password reset email is available once Firebase is connected. In Demo Mode an admin can set a new password from Staff.');
      },
    },
  };
  return backend;
}
