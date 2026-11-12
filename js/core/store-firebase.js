// TAPJERR.io — Cloud Mode backend (Firebase Auth + Firestore + Storage).
// Loaded only when js/core/config.js contains a Firebase web config.
import { firebaseConfig, APP } from './config.js';
import { uid } from './utils.js';

const CDN = `https://www.gstatic.com/firebasejs/${APP.firebaseSdkVersion}`;

export async function createFirebaseBackend() {
  const [appMod, authMod, fsMod, stMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
    import(`${CDN}/firebase-storage.js`),
  ]);
  const { initializeApp, deleteApp } = appMod;
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence } = authMod;
  const {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    onSnapshot,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    writeBatch,
    runTransaction,
  } = fsMod;
  const { getStorage, ref, uploadBytes, getDownloadURL } = stMod;

  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  const storage = getStorage(app);
  let currentUser = auth.currentUser;
  let authReady = false;
  const authListeners = new Set();
  onAuthStateChanged(auth, (u) => {
    currentUser = u ? { uid: u.uid, email: u.email } : null;
    authReady = true;
    authListeners.forEach((fn) => fn(currentUser));
  });

  const snapList = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const buildQuery = (col, opts = {}) => {
    const cons = [];
    if (opts.since) cons.push(where('createdAt', '>=', opts.since));
    if (opts.until) cons.push(where('createdAt', '<=', opts.until));
    (opts.where || []).forEach(([f, op, v]) => cons.push(where(f, op, v)));
    return cons.length ? query(collection(db, col), ...cons) : collection(db, col);
  };
  const clean = (obj) => JSON.parse(JSON.stringify(obj)); // strip undefined

  return {
    mode: 'firebase',
    async init() {},
    watch(col, cb, opts = {}) {
      return onSnapshot(
        buildQuery(col, opts),
        (snap) => cb(snapList(snap)),
        (err) => {
          console.warn(`[TAPJERR] watch ${col}:`, err.code || err.message);
          opts.onError?.(err);
          cb([]);
        }
      );
    },
    watchDoc(col, id, cb) {
      return onSnapshot(
        doc(db, col, id),
        (d) => cb(d.exists() ? { ...d.data(), id: d.id } : null),
        (err) => {
          console.warn(`[TAPJERR] watchDoc ${col}/${id}:`, err.code || err.message);
          cb(null);
        }
      );
    },
    async get(col, id) {
      const d = await getDoc(doc(db, col, id));
      return d.exists() ? { ...d.data(), id: d.id } : null;
    },
    async list(col, opts = {}) {
      return snapList(await getDocs(buildQuery(col, opts)));
    },
    async add(col, data) {
      if (data.id) {
        await setDoc(doc(db, col, data.id), clean(data));
        return data.id;
      }
      const r = await addDoc(collection(db, col), clean(data));
      return r.id;
    },
    async set(col, id, data, { merge = false } = {}) {
      await setDoc(doc(db, col, id), clean({ ...data, id }), { merge });
      return id;
    },
    async update(col, id, patch) {
      await updateDoc(doc(db, col, id), clean(patch));
    },
    async remove(col, id) {
      await deleteDoc(doc(db, col, id));
    },
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const b = writeBatch(db);
        ops.slice(i, i + 450).forEach((op) => {
          const r = doc(db, op.col, op.id);
          if (op.type === 'delete') b.delete(r);
          else if (op.type === 'update') b.set(r, clean({ ...op.data, id: op.id }), { merge: true });
          else b.set(r, clean({ ...op.data, id: op.id }));
        });
        await b.commit();
      }
    },
    async nextCounter(name) {
      const r = doc(db, 'counters', name);
      return runTransaction(db, async (tx) => {
        const d = await tx.get(r);
        const n = (d.exists() ? d.data().n : 0) + 1;
        tx.set(r, { n });
        return n;
      });
    },
    async uploadImage(file, path = 'products') {
      if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const r = ref(storage, `${path}/${Date.now()}-${uid(6)}.${ext}`);
      await uploadBytes(r, file, { contentType: file.type });
      return getDownloadURL(r);
    },
    async resetAll() {
      throw new Error('Reset is disabled in Cloud Mode. Manage data from the Firebase console.');
    },
    auth: {
      get current() {
        return currentUser;
      },
      onChange(fn) {
        authListeners.add(fn);
        if (authReady) queueMicrotask(() => fn(currentUser));
        return () => authListeners.delete(fn);
      },
      async signIn(email, password) {
        try {
          const c = await signInWithEmailAndPassword(auth, email.trim(), password);
          return { uid: c.user.uid, email: c.user.email };
        } catch (e) {
          throw new Error(friendlyAuthError(e));
        }
      },
      async signOut() {
        await signOut(auth);
      },
      // Uses a secondary app instance so the signed-in admin is not replaced.
      async createAccount(email, password, profile) {
        const secondary = initializeApp(firebaseConfig, 'secondary-' + Date.now());
        try {
          const c = await createUserWithEmailAndPassword(getAuth(secondary), email.trim(), password);
          const id = c.user.uid;
          await setDoc(doc(db, 'staff', id), clean({ ...profile, id, email: email.trim().toLowerCase(), active: true, createdAt: Date.now() }));
          await signOut(getAuth(secondary));
          return id;
        } catch (e) {
          throw new Error(friendlyAuthError(e));
        } finally {
          deleteApp(secondary).catch(() => {});
        }
      },
      async changePassword() {
        throw new Error('In Cloud Mode, send the staff member a password reset email instead.');
      },
      async sendReset(email) {
        try {
          await sendPasswordResetEmail(auth, email.trim());
        } catch (e) {
          throw new Error(friendlyAuthError(e));
        }
      },
    },
  };
}

function friendlyAuthError(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || e?.message || 'Authentication failed.';
}
