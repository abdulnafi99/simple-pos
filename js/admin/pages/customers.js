// TAPJERR.io — Customer management (built from order history + saved profiles)
import { icon } from '../../core/icons.js';
import { esc, money, fmtDate, fmtDateTime, debounce, initials, toCSV, downloadFile, isoDate, validPhone, normalizePhone, sortBy } from '../../core/utils.js';
import { openModal, toast, emptyState, skeleton } from '../../core/ui.js';
import { buildCustomers, orderTypeLabel } from '../../core/orders.js';
import { pageHead, statusBadge, payBadge, openOrderDetail } from '../common.js';

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let history = null;
    let profiles = [];
    let q = '';
    let sort = 'lastOrderAt';
    root.innerHTML = `
      ${pageHead('Customers', 'Everyone who ordered with a phone number — from POS, table QR and takeaway.', `<button class="btn btn-outline" data-export>${icon('download', 18)} Export CSV</button><button class="btn btn-primary" data-add>${icon('user-plus', 18)} Add customer</button>`)}
      <div class="mini-stats mb" data-stats></div>
      <div class="toolbar"><div class="input-icon">${icon('search', 18)}<input class="input" placeholder="Search name or phone" data-q></div>
        <select class="select" style="width:auto" data-sort><option value="lastOrderAt">Recent</option><option value="totalSpent">Top spending</option><option value="totalOrders">Most orders</option><option value="name">Name</option></select></div>
      <div class="card" style="padding:8px" data-list>${skeleton(6)}</div>`;
    const $ = (s) => root.querySelector(s);

    function allOrders() {
      const map = new Map((history || []).map((o) => [o.id, o]));
      live.orders.forEach((o) => map.set(o.id, o));
      return [...map.values()];
    }
    function customers() {
      return buildCustomers(allOrders(), profiles);
    }

    function render() {
      if (!history) return;
      let list = customers();
      const totalSpent = list.reduce((a, c) => a + c.totalSpent, 0);
      const repeat = list.filter((c) => c.totalOrders > 1).length;
      $('[data-stats]').innerHTML = `
        <div class="card mini"><span class="mini-icon tone-blue">${icon('users', 20)}</span><div><b>${list.length}</b><span>Customers</span></div></div>
        <div class="card mini"><span class="mini-icon tone-green">${icon('repeat', 20)}</span><div><b>${list.length ? Math.round((repeat / list.length) * 100) : 0}%</b><span>Returning</span></div></div>
        <div class="card mini"><span class="mini-icon tone-indigo">${icon('wallet', 20)}</span><div><b>${money(list.length ? totalSpent / list.length : 0)}</b><span>Avg lifetime spend</span></div></div>`;
      const s = q.toLowerCase();
      if (s) list = list.filter((c) => (c.name || '').toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g, '') || '§'));
      list = sort === 'name' ? sortBy(list, (c) => (c.name || '').toLowerCase()) : sortBy(list, sort, -1);
      $('[data-list]').innerHTML = list.length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Customer</th><th>Phone</th><th class="num">Orders</th><th class="num">Total spending</th><th>Last order</th><th></th></tr></thead><tbody>
          ${list
            .slice(0, 500)
            .map(
              (c) => `<tr class="clickable" data-c="${esc(c.id)}"><td><div class="row"><span class="avatar">${esc(initials(c.name || '#'))}</span><div><b>${esc(c.name || 'Unnamed')}</b>${c.notes ? `<div class="tiny muted truncate" style="max-width:220px">${esc(c.notes)}</div>` : ''}</div></div></td>
            <td class="mono small">${esc(c.phone)}</td><td class="num">${c.totalOrders}</td><td class="num"><b>${money(c.totalSpent)}</b></td><td>${c.lastOrderAt ? esc(fmtDate(c.lastOrderAt)) : '—'}</td><td class="right">${icon('chevron-right', 18)}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : emptyState({ iconName: 'users', title: q ? 'No matching customers' : 'No customers yet', text: 'Customers appear once orders include a phone number.' });
      root.querySelectorAll('[data-c]').forEach((r) => r.addEventListener('click', () => detail(r.dataset.c)));
    }

    function detail(id) {
      const c = customers().find((x) => x.id === id);
      if (!c) return;
      const orders = [...c.orders].sort((a, b) => b.createdAt - a.createdAt);
      const favs = new Map();
      orders.forEach((o) => o.items.forEach((i) => favs.set(i.name, (favs.get(i.name) || 0) + i.qty)));
      const fav = [...favs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const { el, close } = openModal({
        title: c.name || c.phone,
        size: 'lg',
        body: `<div class="mini-stats mb">
            <div class="card flat mini"><div><b>${c.totalOrders}</b><span>Orders</span></div></div>
            <div class="card flat mini"><div><b>${money(c.totalSpent)}</b><span>Total spending</span></div></div>
            <div class="card flat mini"><div><b>${c.totalOrders ? money(c.totalSpent / c.totalOrders) : '—'}</b><span>Avg order</span></div></div>
            <div class="card flat mini"><div><b>${c.firstOrderAt && isFinite(c.firstOrderAt) ? esc(fmtDate(c.firstOrderAt)) : '—'}</b><span>Customer since</span></div></div></div>
          <div class="form-grid mb">
            <div><div class="label mb">Contact</div><a class="btn btn-outline btn-sm" href="tel:${esc(c.phone)}">${icon('phone', 14)} ${esc(c.phone)}</a> <a class="btn btn-outline btn-sm" href="https://wa.me/6${esc(normalizePhone(c.phone))}" target="_blank" rel="noopener">${icon('message-circle', 14)} WhatsApp</a></div>
            <div><div class="label mb">Favourites</div>${fav.length ? fav.map(([n, q]) => `<span class="badge tone-blue">${esc(n)} ×${q}</span>`).join(' ') : '<span class="muted small">—</span>'}</div>
          </div>
          <form class="form-grid mb" data-f><label class="field"><span>Name</span><input class="input" name="name" value="${esc(c.name || '')}" maxlength="80"></label>
            <label class="field"><span>Notes</span><input class="input" name="notes" value="${esc(c.notes || '')}" maxlength="200" placeholder="Preferences, allergies…"></label></form>
          <h4 class="mb">Order history</h4>
          ${orders.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Date</th><th>Type</th><th>Items</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>${orders
            .map((o) => `<tr class="clickable" data-o="${esc(o.id)}"><td><b>${esc(o.orderNo)}</b></td><td class="nowrap small">${esc(fmtDateTime(o.createdAt))}</td><td class="small">${esc(orderTypeLabel(o))}</td><td class="small muted">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</td><td>${statusBadge(o.status)} ${payBadge(o.paymentStatus)}</td><td class="num">${money(o.total)}</td></tr>`)
            .join('')}</tbody></table></div>` : '<p class="muted small">No orders yet.</p>'}`,
        footer: `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" data-save>Save profile</button>`,
      });
      el.querySelectorAll('[data-o]').forEach((r) =>
        r.addEventListener('click', () => {
          if (!live.orders.find((o) => o.id === r.dataset.o)) live.data.orders = [...live.orders, orders.find((o) => o.id === r.dataset.o)];
          openOrderDetail(r.dataset.o, ctx);
        })
      );
      el.querySelector('[data-save]').onclick = async () => {
        const f = el.querySelector('[data-f]');
        await store.set('customers', c.id, { name: f.name.value.trim(), notes: f.notes.value.trim(), updatedAt: Date.now(), createdAt: c.firstOrderAt && isFinite(c.firstOrderAt) ? c.firstOrderAt : Date.now() }, { merge: true });
        toast('Customer profile saved.', 'success');
        close();
      };
    }

    function add() {
      const { el, close } = openModal({
        title: 'Add customer',
        size: 'sm',
        body: `<form class="form" data-f><label class="field"><span>Name *</span><input class="input" name="name" required maxlength="80"></label>
          <label class="field"><span>Phone *</span><input class="input" name="phone" inputmode="tel" required placeholder="012-345 6789"></label>
          <label class="field"><span>Notes</span><input class="input" name="notes" maxlength="200"></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>`,
      });
      el.querySelector('[data-ok]').onclick = async () => {
        const f = el.querySelector('[data-f]');
        if (!f.name.value.trim() || !validPhone(f.phone.value)) return toast('Enter a name and valid phone number.', 'error');
        const id = normalizePhone(f.phone.value);
        await store.set('customers', id, { name: f.name.value.trim(), notes: f.notes.value.trim(), createdAt: Date.now() }, { merge: true });
        toast('Customer added.', 'success');
        close();
      };
    }

    $('[data-q]').addEventListener(
      'input',
      debounce((e) => {
        q = e.target.value.trim();
        render();
      }, 150)
    );
    $('[data-sort]').addEventListener('change', (e) => {
      sort = e.target.value;
      render();
    });
    $('[data-add]').onclick = add;
    $('[data-export]').onclick = () => {
      const rows = [['Name', 'Phone', 'Total orders', 'Total spending (RM)', 'Last order', 'Notes']];
      customers().forEach((c) => rows.push([c.name, c.phone, c.totalOrders, c.totalSpent, c.lastOrderAt ? fmtDateTime(c.lastOrderAt) : '', c.notes]));
      downloadFile(`customers-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    };

    store
      .list('orders', { since: Date.now() - 730 * 86400000 })
      .then((list) => {
        history = list;
        render();
      })
      .catch((e) => {
        history = [];
        toast(e.message, 'error');
        render();
      });
    const unsubs = [live.on('orders', render), store.watch('customers', (p) => ((profiles = p), render()))];
    return () => unsubs.forEach((u) => u());
  },
};
