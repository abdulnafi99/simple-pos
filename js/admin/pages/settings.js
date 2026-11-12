// TAPJERR.io — System settings
import { icon } from '../../core/icons.js';
import { esc, money, uid, downloadFile, isoDate } from '../../core/utils.js';
import { toast, confirmDialog, withBusy } from '../../core/ui.js';
import { storeOpenNow, fmt12 } from '../../core/orders.js';
import { baseUrl } from '../../core/qr.js';
import { receiptHTML } from '../../core/receipt.js';
import { pageHead } from '../common.js';
import { generateDemoOrders, clearDemoOrders } from '../demo.js';

const TABS = [
  ['store', 'Store profile', 'store'],
  ['hours', 'Hours & status', 'clock'],
  ['ordering', 'Ordering & QR', 'qr-code'],
  ['payments', 'Payment methods', 'wallet'],
  ['tax', 'Tax & discounts', 'percent'],
  ['receipt', 'Receipt', 'receipt'],
  ['notifications', 'Notifications', 'bell'],
  ['data', 'Data', 'database'],
];
const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let tab = ctx.params.get('tab') || 'store';
    let draft = null;
    let dirty = false;
    root.innerHTML = `
      ${pageHead('Settings', 'Configure Selagi Coffee — profile, hours, payments, tax and receipts.', `<button class="btn btn-ghost" data-revert>Discard</button><button class="btn btn-primary" data-save>${icon('save', 18)} Save changes</button>`)}
      <div class="settings-layout">
        <nav class="settings-nav">${TABS.map(([id, l, ic]) => `<button data-tab="${id}">${icon(ic, 18)} ${l}</button>`).join('')}</nav>
        <div class="card" data-body></div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const setDirty = (v = true) => {
      dirty = v;
      $('[data-save]').disabled = !v;
      $('[data-revert]').disabled = !v;
    };

    const sw = (key, label, sub = '', checked = draft[key]) => `<label class="row between" style="padding:6px 0"><span><b>${label}</b>${sub ? `<br><span class="small muted">${sub}</span>` : ''}</span><span class="switch"><input type="checkbox" data-k="${key}" ${checked ? 'checked' : ''}><span class="track"></span></span></label>`;
    const field = (key, label, attrs = '', hint = '') => `<label class="field"><span>${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</span><input class="input" data-k="${key}" value="${esc(draft[key] ?? '')}" ${attrs}></label>`;

    function render() {
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      const d = draft;
      const body = $('[data-body]');
      let h = '';
      if (tab === 'store') {
        h = `<h3 class="mb">Store profile</h3>
          <div class="img-drop mb"><img src="${esc(d.logo || 'assets/icon.svg')}" alt="Logo" style="object-fit:contain;background:var(--surface-2)">
            <div class="col"><label class="btn btn-outline">${icon('image-up', 18)} Upload logo<input type="file" accept="image/*" hidden data-logo></label>${d.logo ? `<button class="btn btn-ghost btn-sm" data-rmlogo>Remove</button>` : ''}</div></div>
          <div class="form-grid">${field('name', 'Cafe name', 'maxlength="60" required')}${field('tagline', 'Tagline', 'maxlength="80"')}
            ${field('phone', 'Phone number', 'inputmode="tel"')}${field('email', 'Email', 'type="email"')}
            <label class="field span-2"><span>Address</span><textarea class="textarea" data-k="address" rows="2">${esc(d.address)}</textarea></label>
            <label class="field span-2"><span>Customer welcome message</span><input class="input" data-k="welcome" value="${esc(d.welcome)}" maxlength="140"></label>
            ${field('category', 'Business category')}</div>`;
      } else if (tab === 'hours') {
        const open = storeOpenNow(d);
        h = `<h3 class="mb">Hours & store status</h3>
          <div class="demo-banner ${open ? 'tone-green' : 'tone-red'} mb">${icon(open ? 'store' : 'store', 16)} Store is currently <b>${open ? 'OPEN' : 'CLOSED'}</b> for customer orders.</div>
          <div class="label mb">Opening / closing status</div>
          <div class="seg mb" data-mode>${[
            ['auto', 'Follow hours'],
            ['open', 'Force open'],
            ['closed', 'Force closed'],
          ]
            .map(([v, l]) => `<button data-m="${v}" class="${d.storeMode === v ? 'active' : ''}">${l}</button>`)
            .join('')}</div>
          <div class="label mb mt">Operating hours</div>
          <div class="hours-grid">${DAYS.map(([k, l]) => {
            const x = d.hours[k];
            return `<b>${l}</b><input class="input" type="time" data-h="${k}:open" value="${x.open}" ${x.closed ? 'disabled' : ''}><input class="input" type="time" data-h="${k}:close" value="${x.close}" ${x.closed ? 'disabled' : ''}>
              <label class="check small"><input type="checkbox" data-h="${k}:closed" ${x.closed ? 'checked' : ''}> Closed</label>`;
          }).join('')}</div>
          <p class="tiny muted mt">Shown to customers as e.g. ${fmt12(d.hours.mon.open)} – ${fmt12(d.hours.mon.close)}.</p>`;
      } else if (tab === 'ordering') {
        h = `<h3 class="mb">Ordering & QR</h3>
          ${sw('dineInQrEnabled', 'Dine-in table QR ordering', 'Customers scan the table QR to order.')}
          ${sw('takeawayEnabled', 'Online takeaway / tapau', 'Customers order ahead and pick up.')}
          <hr class="divider">
          <div class="form-grid">
            <label class="field span-2"><span>QR base URL <span class="hint">Your public domain, e.g. https://tapjerr.io — leave blank to use this site's address</span></span><input class="input" data-k="baseUrl" value="${esc(d.baseUrl)}" placeholder="${esc(baseUrl({}))}"></label>
            <label class="field"><span>Estimated preparation time (minutes)</span><input class="input" type="number" min="1" max="180" data-k="prepMinutes" data-num value="${d.prepMinutes}"></label>
            <label class="field"><span>Daily sales target (RM)</span><input class="input" type="number" min="0" data-k="dailyTarget" data-num value="${d.dailyTarget}"></label>
          </div>
          <p class="small muted mt">Table links look like <span class="mono">${esc(baseUrl(d))}/order/table/01</span></p>
          <hr class="divider">${sw('autoDeductInventory', 'Deduct inventory on completion', 'Uses each product recipe when an order is marked completed.')}`;
      } else if (tab === 'payments') {
        h = `<div class="row between mb"><h3>Payment methods</h3><button class="btn btn-sm btn-soft" data-addpm>${icon('plus', 14)} Add method</button></div>
          <p class="small muted mb">Online transfers & DuitNow payments by customers are marked <b>Verifying</b> until staff confirm the money arrived — never auto-marked as paid.</p>
          <div class="col">${d.paymentMethods
            .map(
              (m, i) => `<div class="card flat"><div class="row between wrap"><div class="row"><span class="mini-icon tone-blue">${icon(m.type === 'cash' ? 'banknote' : m.type === 'qr' ? 'qr-code' : m.type === 'transfer' ? 'landmark' : 'credit-card', 18)}</span>
                <input class="input" style="height:38px;max-width:220px" data-pm="${i}:name" value="${esc(m.name)}"><select class="select" style="height:38px;width:auto" data-pm="${i}:type">${['cash', 'qr', 'transfer', 'other'].map((t) => `<option value="${t}" ${m.type === t ? 'selected' : ''}>${{ cash: 'Cash', qr: 'QR (DuitNow)', transfer: 'Bank transfer', other: 'Other' }[t]}</option>`).join('')}</select></div>
                <div class="row"><label class="check small"><input type="checkbox" data-pm="${i}:customer" ${m.customer ? 'checked' : ''}> Customer can choose</label>
                <span class="switch" title="Enabled"><input type="checkbox" data-pm="${i}:enabled" ${m.enabled ? 'checked' : ''}><span class="track"></span></span>
                ${['cash', 'duitnow', 'transfer'].includes(m.id) ? '' : `<button class="icon-btn sm danger" data-rmpm="${i}" aria-label="Remove">${icon('trash-2', 16)}</button>`}</div></div>
                <label class="field mt"><span>Instructions shown to customers</span><input class="input" data-pm="${i}:instructions" value="${esc(m.instructions || '')}" maxlength="200"></label>
                ${m.type === 'transfer' ? `<div class="form-grid mt"><label class="field"><span>Bank</span><input class="input" data-pm="${i}:bank" value="${esc(m.bank || '')}"></label><label class="field"><span>Account name</span><input class="input" data-pm="${i}:accountName" value="${esc(m.accountName || '')}"></label><label class="field span-2"><span>Account number</span><input class="input" data-pm="${i}:accountNo" value="${esc(m.accountNo || '')}"></label></div>` : ''}
                ${m.type === 'qr' ? `<div class="row mt">${m.qrImage ? `<img src="${esc(m.qrImage)}" alt="" style="width:90px;height:90px;object-fit:contain;border-radius:10px;border:1px solid var(--border)">` : ''}<label class="btn btn-sm btn-outline">${icon('image-up', 14)} ${m.qrImage ? 'Replace' : 'Upload'} DuitNow QR image<input type="file" accept="image/*" hidden data-qrimg="${i}"></label></div>` : ''}
              </div>`
            )
            .join('')}</div>`;
      } else if (tab === 'tax') {
        h = `<h3 class="mb">Tax, service charge & discounts</h3>
          ${sw('taxEnabled', 'Charge tax', 'e.g. SST 6% / 8% on F&B')}
          <div class="form-grid mb"><label class="field"><span>Tax label</span><input class="input" data-k="taxLabel" value="${esc(d.taxLabel)}"></label><label class="field"><span>Tax rate (%)</span><input class="input" type="number" min="0" max="100" step="0.1" data-k="taxRate" data-num value="${d.taxRate}"></label></div>
          ${sw('serviceEnabled', 'Service charge')}
          <div class="form-grid mb"><label class="field"><span>Service charge (%)</span><input class="input" type="number" min="0" max="100" step="0.1" data-k="serviceRate" data-num value="${d.serviceRate}"></label>
            <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" data-k="serviceDineInOnly" ${d.serviceDineInOnly ? 'checked' : ''}> Dine-in only</label></div>
          ${sw('cashRounding', 'Cash rounding (5 sen)', 'Rounds cash totals to the nearest RM0.05 as required in Malaysia.')}
          <hr class="divider"><div class="row between mb"><b>Discount presets</b><button class="btn btn-sm btn-soft" data-adddp>${icon('plus', 14)} Add preset</button></div>
          <div class="col">${(d.discountPresets || [])
            .map((p, i) => `<div class="og-opt" style="grid-template-columns:1fr 110px 110px 36px"><input class="input" data-dp="${i}:name" value="${esc(p.name)}" placeholder="Name"><select class="select" style="height:38px" data-dp="${i}:type"><option value="percent" ${p.type === 'percent' ? 'selected' : ''}>%</option><option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>RM</option></select><input class="input" type="number" min="0" step="0.01" data-dp="${i}:value" value="${p.value}"><button class="icon-btn sm danger" data-rmdp="${i}" aria-label="Remove">${icon('x', 16)}</button></div>`)
            .join('') || '<p class="small muted">No presets.</p>'}</div>`;
      } else if (tab === 'receipt') {
        const sample = { orderNo: 'TAP-SAMPLE-001', createdAt: Date.now(), type: 'takeaway', source: 'pos', cashierName: ctx.user.name, customer: { name: 'Sample' }, items: [{ name: 'Pistachio Latte', qty: 1, price: 15.9, options: [{ name: 'Iced' }] }, { name: 'Donuts', qty: 2, price: 5.9, options: [] }], subtotal: 27.7, serviceCharge: 0, tax: 0, rounding: 0, total: 27.7, paymentMethod: 'cash', paymentStatus: 'paid', cashReceived: 30, change: 2.3 };
        h = `<h3 class="mb">Receipt</h3><div class="form-grid"><div class="col">
          <label class="field"><span>Header message</span><input class="input" data-r="header" value="${esc(d.receipt.header)}" maxlength="100"></label>
          <label class="field"><span>Footer message</span><input class="input" data-r="footer" value="${esc(d.receipt.footer)}" maxlength="140"></label>
          <label class="check"><input type="checkbox" data-r="showLogo" ${d.receipt.showLogo ? 'checked' : ''}> Show logo</label>
          <label class="check"><input type="checkbox" data-r="showAddress" ${d.receipt.showAddress ? 'checked' : ''}> Show address</label></div>
          <div><div class="label mb">Preview</div>${receiptHTML(sample, d)}</div></div>`;
      } else if (tab === 'notifications') {
        h = `<h3 class="mb">Order notifications</h3>
          ${sw('orderSound', 'Sound for new customer orders', 'Plays a chime on the dashboard when a QR or online order arrives.')}
          <hr class="divider"><div class="row between"><span><b>Desktop notifications</b><br><span class="small muted">Alerts even when this tab is in the background. Status: ${'Notification' in window ? Notification.permission : 'unsupported'}</span></span>
          <button class="btn btn-sm btn-outline" data-notif>${icon('bell-ring', 14)} Enable</button></div>
          <hr class="divider"><p class="small muted">Customers see live status on their tracking page (Order Received → Confirmed → Preparing → Ready → Completed). From the Takeaway board you can also notify them via WhatsApp when an order is ready.</p>`;
      } else if (tab === 'data') {
        const demoCount = live.orders.filter((o) => o.demo).length;
        h = `<h3 class="mb">Data</h3>
          <div class="card flat mb"><b>Storage mode: ${store.mode === 'demo' ? 'Demo Mode (this browser)' : 'Cloud Mode (Firebase)'}</b>
            <p class="small muted mt">${store.mode === 'demo' ? 'Data is saved in this browser and synced live between tabs on this device. Add your Firebase config in <span class="mono">js/core/config.js</span> to sync across all devices.' : 'Data is stored in Cloud Firestore and synced live across all devices.'}</p></div>
          <div class="card flat mb"><b>Demo sales data</b><p class="small muted mt">Generate ~30 days of clearly-labelled sample orders to explore reports. Every demo order is tagged “Demo data”. ${demoCount ? `<b>${demoCount}</b> demo orders currently loaded.` : ''}</p>
            <div class="row mt">${ctx.can('loadDemoData') ? `<button class="btn btn-sm btn-outline" data-demo-gen>${icon('flask-conical', 14)} Generate demo data</button>` : ''}<button class="btn btn-sm btn-outline" data-demo-clear ${demoCount ? '' : 'disabled'}>${icon('trash-2', 14)} Remove demo data</button></div></div>
          <div class="card flat mb"><b>Backup</b><p class="small muted mt">Download menu, tables, settings and inventory as JSON.</p><button class="btn btn-sm btn-outline mt" data-backup>${icon('download', 14)} Download backup</button></div>
          ${store.mode === 'demo' && ctx.can('resetData') ? `<div class="card flat" style="border-color:var(--red-50)"><b style="color:var(--red)">Reset everything</b><p class="small muted mt">Erase all data in this browser and restore the Selagi Coffee starter setup.</p><button class="btn btn-sm btn-danger mt" data-reset>${icon('rotate-ccw', 14)} Reset Demo Mode</button></div>` : ''}`;
      }
      body.innerHTML = `<div class="fade-in">${h}</div>`;
      bind(body);
    }

    function bind(body) {
      body.querySelectorAll('[data-k]').forEach((inp) => {
        const ev = inp.type === 'checkbox' ? 'change' : 'input';
        inp.addEventListener(ev, () => {
          draft[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : 'num' in inp.dataset ? Number(inp.value) : inp.value;
          setDirty();
        });
      });
      body.querySelectorAll('[data-m]').forEach((b) =>
        b.addEventListener('click', () => {
          draft.storeMode = b.dataset.m;
          setDirty();
          render();
        })
      );
      body.querySelectorAll('[data-h]').forEach((inp) =>
        inp.addEventListener('change', () => {
          const [day, key] = inp.dataset.h.split(':');
          draft.hours[day] = { ...draft.hours[day], [key]: inp.type === 'checkbox' ? inp.checked : inp.value };
          setDirty();
          if (key === 'closed') render();
        })
      );
      body.querySelectorAll('[data-pm]').forEach((inp) =>
        inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
          const [i, key] = inp.dataset.pm.split(':');
          draft.paymentMethods[i] = { ...draft.paymentMethods[i], [key]: inp.type === 'checkbox' ? inp.checked : inp.value };
          setDirty();
          if (key === 'type') render();
        })
      );
      body.querySelectorAll('[data-qrimg]').forEach((inp) =>
        inp.addEventListener('change', async () => {
          try {
            const url = await store.uploadImage(inp.files[0], 'payments');
            draft.paymentMethods[inp.dataset.qrimg].qrImage = url;
            setDirty();
            render();
          } catch (e) {
            toast(e.message, 'error');
          }
        })
      );
      body.querySelector('[data-addpm]')?.addEventListener('click', () => {
        draft.paymentMethods.push({ id: 'pm_' + uid(6), name: 'New method', type: 'other', enabled: true, customer: false, instructions: '' });
        setDirty();
        render();
      });
      body.querySelectorAll('[data-rmpm]').forEach((b) =>
        b.addEventListener('click', () => {
          draft.paymentMethods.splice(Number(b.dataset.rmpm), 1);
          setDirty();
          render();
        })
      );
      body.querySelectorAll('[data-dp]').forEach((inp) =>
        inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
          const [i, key] = inp.dataset.dp.split(':');
          draft.discountPresets[i] = { ...draft.discountPresets[i], [key]: key === 'value' ? Number(inp.value) : inp.value };
          setDirty();
        })
      );
      body.querySelector('[data-adddp]')?.addEventListener('click', () => {
        draft.discountPresets = [...(draft.discountPresets || []), { id: uid(6), name: 'New discount', type: 'percent', value: 10 }];
        setDirty();
        render();
      });
      body.querySelectorAll('[data-rmdp]').forEach((b) =>
        b.addEventListener('click', () => {
          draft.discountPresets.splice(Number(b.dataset.rmdp), 1);
          setDirty();
          render();
        })
      );
      body.querySelectorAll('[data-r]').forEach((inp) =>
        inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
          draft.receipt = { ...draft.receipt, [inp.dataset.r]: inp.type === 'checkbox' ? inp.checked : inp.value };
          setDirty();
          if (inp.type === 'checkbox') render();
        })
      );
      body.querySelector('[data-logo]')?.addEventListener('change', async (e) => {
        try {
          draft.logo = await store.uploadImage(e.target.files[0], 'branding');
          setDirty();
          render();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      body.querySelector('[data-rmlogo]')?.addEventListener('click', () => {
        draft.logo = '';
        setDirty();
        render();
      });
      body.querySelector('[data-notif]')?.addEventListener('click', async () => {
        if (!('Notification' in window)) return toast('Notifications are not supported in this browser.', 'warning');
        const p = await Notification.requestPermission();
        toast(p === 'granted' ? 'Desktop notifications enabled.' : 'Permission not granted.', p === 'granted' ? 'success' : 'warning');
        render();
      });
      body.querySelector('[data-demo-gen]')?.addEventListener('click', (e) =>
        withBusy(e.currentTarget, async () => {
          try {
            const n = await generateDemoOrders(live);
            toast(`${n} demo orders generated.`, 'success');
            setTimeout(render, 100);
          } catch (err) {
            toast(err.message, 'error');
          }
        })
      );
      body.querySelector('[data-demo-clear]')?.addEventListener('click', async (e) => {
        if (!(await confirmDialog({ title: 'Remove demo data?', message: 'All orders labelled “Demo data” will be deleted. Real orders are untouched.', confirmText: 'Remove', danger: true }))) return;
        withBusy(e.currentTarget, async () => {
          const n = await clearDemoOrders();
          toast(`${n} demo orders removed.`, 'success');
          setTimeout(render, 100);
        });
      });
      body.querySelector('[data-backup]')?.addEventListener('click', async () => {
        const [suppliers] = await Promise.all([store.list('suppliers')]);
        const backup = { exportedAt: new Date().toISOString(), settings: live.settings, categories: live.categories, products: live.products, tables: live.tables, inventory: live.inventory, suppliers };
        downloadFile(`tapjerr-backup-${isoDate()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      });
      body.querySelector('[data-reset]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Reset Demo Mode?', message: 'This erases every order, product change and account in this browser.', confirmText: 'Erase & reset', danger: true }))) return;
        await store.resetAll();
        location.reload();
      });
    }

    function load() {
      draft = structuredClone(live.settings);
      setDirty(false);
      render();
    }

    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        history.replaceState(null, '', `#/settings?tab=${tab}`);
        render();
      })
    );
    $('[data-revert]').onclick = load;
    $('[data-save]').onclick = (e) => {
      if (!draft.name?.trim()) return toast('Cafe name is required.', 'error');
      if (draft.baseUrl && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(draft.baseUrl.trim())) return toast('Base URL should look like https://tapjerr.io', 'error');
      withBusy(e.currentTarget, async () => {
        const { id, ...data } = draft;
        await store.set('settings', 'store', data);
        setDirty(false);
        toast('Settings saved.', 'success');
      });
    };
    const unsub = live.on('settings', () => {
      if (!dirty) load();
    });
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', warn);
    };
  },
};

export { money };
