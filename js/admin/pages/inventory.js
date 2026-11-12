// TAPJERR.io — Inventory: stock in/out, balances, low-stock alerts, movements, suppliers
import { icon } from '../../core/icons.js';
import { esc, money, uid, round2, fmtDateTime, toCSV, downloadFile, isoDate } from '../../core/utils.js';
import { openModal, toast, confirmDialog, emptyState, withBusy, formValues } from '../../core/ui.js';
import { pageHead } from '../common.js';

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let tab = ctx.params.get('tab') || 'stock';
    let moves = [];
    let suppliers = [];
    root.innerHTML = `
      ${pageHead('Inventory', 'Track ingredients and supplies. Sales automatically deduct stock based on product recipes.', `<button class="btn btn-outline" data-export>${icon('download', 18)} Export</button><button class="btn btn-primary" data-add>${icon('plus', 18)} Add item</button>`)}
      <div class="mini-stats mb" data-stats></div>
      <div class="tabs mb"><button class="tab" data-tab="stock">${icon('package', 16)} Stock</button><button class="tab" data-tab="moves">${icon('arrow-left-right', 16)} Movements</button><button class="tab" data-tab="suppliers">${icon('truck', 16)} Suppliers</button></div>
      <div class="card" style="padding:8px" data-body></div>`;
    const $ = (s) => root.querySelector(s);
    const supName = (id) => suppliers.find((s) => s.id === id)?.name || '—';

    function render() {
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      const inv = [...live.inventory].sort((a, b) => a.name.localeCompare(b.name));
      const low = inv.filter((i) => i.stock <= i.lowAt);
      const value = round2(inv.reduce((a, i) => a + Math.max(0, i.stock) * (i.cost || 0), 0));
      $('[data-stats]').innerHTML = `
        <div class="card mini"><span class="mini-icon tone-blue">${icon('package', 20)}</span><div><b>${inv.length}</b><span>Items tracked</span></div></div>
        <div class="card mini"><span class="mini-icon ${low.length ? 'tone-red' : 'tone-green'}">${icon('triangle-alert', 20)}</span><div><b>${low.length}</b><span>Low stock</span></div></div>
        <div class="card mini"><span class="mini-icon tone-indigo">${icon('wallet', 20)}</span><div><b>${money(value)}</b><span>Stock value</span></div></div>
        <div class="card mini"><span class="mini-icon tone-amber">${icon('truck', 20)}</span><div><b>${suppliers.length}</b><span>Suppliers</span></div></div>`;
      const body = $('[data-body]');
      $('[data-add]').innerHTML = tab === 'suppliers' ? `${icon('plus', 18)} Add supplier` : `${icon('plus', 18)} Add item`;
      if (tab === 'stock') {
        body.innerHTML = inv.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Item</th><th class="num">Stock</th><th>Level</th><th class="num">Alert at</th><th class="num">Unit cost</th><th>Supplier</th><th></th></tr></thead><tbody>
            ${inv
              .map((i) => {
                const pctv = Math.max(0, Math.min(100, (i.stock / Math.max(1, i.lowAt * 4)) * 100));
                const isLow = i.stock <= i.lowAt;
                return `<tr><td><b>${esc(i.name)}</b> ${isLow ? '<span class="badge tone-red">Low</span>' : ''}</td>
                <td class="num"><b>${round2(i.stock).toLocaleString()}</b> <span class="muted">${esc(i.unit)}</span></td>
                <td><div class="stock-bar"><span style="width:${pctv}%;background:${isLow ? 'var(--red)' : pctv < 50 ? '#e08a1e' : 'var(--green)'}"></span></div></td>
                <td class="num">${i.lowAt} ${esc(i.unit)}</td><td class="num">${i.cost ? money(i.cost) : '—'}</td><td>${esc(supName(i.supplierId))}</td>
                <td class="right nowrap"><button class="btn btn-sm btn-soft" data-in="${esc(i.id)}">${icon('plus', 14)} In</button> <button class="btn btn-sm btn-outline" data-out="${esc(i.id)}">${icon('minus', 14)} Out</button>
                  <button class="icon-btn sm" data-e="${esc(i.id)}" aria-label="Edit">${icon('pencil', 16)}</button><button class="icon-btn sm danger" data-d="${esc(i.id)}" aria-label="Delete">${icon('trash-2', 16)}</button></td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : emptyState({ iconName: 'package', title: 'No inventory items', text: 'Add ingredients like coffee beans, milk and cups to track stock.' });
        body.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => move(b.dataset.in, 'in')));
        body.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => move(b.dataset.out, 'out')));
        body.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => editItem(live.inventory.find((i) => i.id === b.dataset.e))));
        body.querySelectorAll('[data-d]').forEach((b) =>
          b.addEventListener('click', async () => {
            const i = live.inventory.find((x) => x.id === b.dataset.d);
            const used = live.products.filter((p) => (p.recipe || []).some((r) => r.inventoryId === i.id));
            if (!(await confirmDialog({ title: `Delete ${i.name}?`, message: used.length ? `It is used in ${used.length} product recipe(s); those links will be ignored.` : 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return;
            await store.remove('inventory', i.id);
            toast('Item deleted.', 'success');
          })
        );
      } else if (tab === 'moves') {
        const list = [...moves].sort((a, b) => b.createdAt - a.createdAt).slice(0, 300);
        body.innerHTML = list.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Qty</th><th>Note</th><th>By</th></tr></thead><tbody>
            ${list
              .map((m) => {
                const tone = m.type === 'in' ? 'green' : m.type === 'sale' ? 'blue' : m.type === 'adjust' ? 'indigo' : 'amber';
                return `<tr><td class="nowrap">${esc(fmtDateTime(m.createdAt))}</td><td>${esc(m.itemName || m.inventoryId)}</td><td><span class="badge tone-${tone}">${esc({ in: 'Stock in', out: 'Stock out', sale: 'Sale', adjust: 'Adjustment' }[m.type] || m.type)}</span></td>
                <td class="num" style="color:${m.qty >= 0 ? 'var(--green)' : 'var(--red)'}"><b>${m.qty >= 0 ? '+' : ''}${round2(m.qty)}</b> ${esc(m.unit || '')}</td><td class="small">${esc(m.note || '')}</td><td class="small muted">${esc(m.by || '')}</td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : emptyState({ iconName: 'arrow-left-right', title: 'No stock movements yet', text: 'Stock in/out and sale deductions are logged here.' });
      } else {
        body.innerHTML = suppliers.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th>Items</th><th>Notes</th><th></th></tr></thead><tbody>
            ${suppliers
              .map(
                (s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.contact || '—')}</td><td>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '—'}</td><td>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '—'}</td>
              <td>${live.inventory.filter((i) => i.supplierId === s.id).length}</td><td class="small muted">${esc(s.notes || '')}</td>
              <td class="right nowrap"><button class="icon-btn sm" data-se="${esc(s.id)}" aria-label="Edit">${icon('pencil', 16)}</button><button class="icon-btn sm danger" data-sd="${esc(s.id)}" aria-label="Delete">${icon('trash-2', 16)}</button></td></tr>`
              )
              .join('')}</tbody></table></div>`
          : emptyState({ iconName: 'truck', title: 'No suppliers yet', text: 'Keep supplier contacts handy for quick reordering.' });
        body.querySelectorAll('[data-se]').forEach((b) => b.addEventListener('click', () => editSupplier(suppliers.find((s) => s.id === b.dataset.se))));
        body.querySelectorAll('[data-sd]').forEach((b) =>
          b.addEventListener('click', async () => {
            if (!(await confirmDialog({ title: 'Delete supplier?', confirmText: 'Delete', danger: true }))) return;
            await store.remove('suppliers', b.dataset.sd);
            toast('Supplier deleted.', 'success');
          })
        );
      }
    }

    function move(id, type) {
      const i = live.inventory.find((x) => x.id === id);
      const { el, close } = openModal({
        title: `${type === 'in' ? 'Stock in' : 'Stock out'} · ${i.name}`,
        size: 'sm',
        body: `<p class="small muted mb">Current balance: <b>${round2(i.stock)} ${esc(i.unit)}</b></p><form class="form" data-f>
          <label class="field"><span>Quantity (${esc(i.unit)})</span><input class="input" name="qty" type="number" min="0" step="0.01" required autofocus></label>
          ${type === 'out' ? `<label class="field"><span>Reason</span><select class="select" name="reason"><option>Wastage</option><option>Spoiled / expired</option><option>Staff use</option><option>Adjustment (stock count)</option><option>Other</option></select></label>` : `<label class="field"><span>Unit cost (RM, optional)</span><input class="input" name="cost" type="number" min="0" step="0.0001" value="${i.cost || ''}"></label>`}
          <label class="field"><span>Note</span><input class="input" name="note" maxlength="120" placeholder="${type === 'in' ? 'e.g. Invoice #1234' : ''}"></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${type === 'in' ? 'btn-success' : 'btn-primary'}" data-ok>Save</button>`,
      });
      el.querySelector('[data-ok]').onclick = (e) => {
        const v = formValues(el.querySelector('[data-f]'));
        const qty = Number(v.qty);
        if (!(qty > 0)) return toast('Enter a quantity greater than 0.', 'error');
        withBusy(e.currentTarget, async () => {
          const delta = type === 'in' ? qty : -qty;
          const patch = { stock: round2((i.stock || 0) + delta) };
          if (type === 'in' && v.cost) patch.cost = Number(v.cost);
          await store.batch([
            { col: 'inventory', id: i.id, type: 'update', data: patch },
            { col: 'stockMoves', id: uid(), type: 'set', data: { inventoryId: i.id, itemName: i.name, unit: i.unit, type: type === 'out' && v.reason?.startsWith('Adjustment') ? 'adjust' : type, qty: delta, note: [v.reason, v.note].filter(Boolean).join(' · '), by: ctx.user.name, createdAt: Date.now() } },
          ]);
          toast(`${i.name}: ${delta > 0 ? '+' : ''}${delta} ${i.unit}`, 'success');
          close();
        });
      };
    }

    function editItem(item) {
      const i = item || { name: '', unit: 'pcs', stock: 0, lowAt: 0, cost: '', supplierId: '' };
      const { el, close } = openModal({
        title: item ? `Edit ${item.name}` : 'Add inventory item',
        size: 'md',
        body: `<form class="form-grid" data-f>
          <label class="field span-2"><span>Item name *</span><input class="input" name="name" required maxlength="60" value="${esc(i.name)}"></label>
          <label class="field"><span>Unit</span><select class="select" name="unit">${['pcs', 'g', 'kg', 'ml', 'L', 'pack', 'box', 'bottle'].map((u) => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          ${item ? '' : `<label class="field"><span>Opening stock</span><input class="input" name="stock" type="number" min="0" step="0.01" value="${i.stock}"></label>`}
          <label class="field"><span>Low stock alert at</span><input class="input" name="lowAt" type="number" min="0" step="0.01" value="${i.lowAt}"></label>
          <label class="field"><span>Unit cost (RM)</span><input class="input" name="cost" type="number" min="0" step="0.0001" value="${i.cost}"></label>
          <label class="field span-2"><span>Supplier</span><select class="select" name="supplierId"><option value="">—</option>${suppliers.map((s) => `<option value="${esc(s.id)}" ${s.id === i.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>`,
      });
      el.querySelector('[data-ok]').onclick = (e) => {
        const v = formValues(el.querySelector('[data-f]'));
        if (!v.name) return toast('Item name is required.', 'error');
        const data = { name: v.name, unit: v.unit, lowAt: Number(v.lowAt) || 0, cost: Number(v.cost) || 0, supplierId: v.supplierId };
        withBusy(e.currentTarget, async () => {
          if (item) await store.update('inventory', item.id, data);
          else {
            const id = uid(10);
            const stock = Number(v.stock) || 0;
            await store.batch([
              { col: 'inventory', id, type: 'set', data: { ...data, stock } },
              ...(stock ? [{ col: 'stockMoves', id: uid(), type: 'set', data: { inventoryId: id, itemName: data.name, unit: data.unit, type: 'in', qty: stock, note: 'Opening stock', by: ctx.user.name, createdAt: Date.now() } }] : []),
            ]);
          }
          toast('Inventory saved.', 'success');
          close();
        });
      };
    }

    function editSupplier(sup) {
      const s = sup || { name: '', contact: '', phone: '', email: '', notes: '' };
      const { el, close } = openModal({
        title: sup ? 'Edit supplier' : 'Add supplier',
        size: 'md',
        body: `<form class="form-grid" data-f>
          <label class="field span-2"><span>Company name *</span><input class="input" name="name" required value="${esc(s.name)}"></label>
          <label class="field"><span>Contact person</span><input class="input" name="contact" value="${esc(s.contact)}"></label>
          <label class="field"><span>Phone</span><input class="input" name="phone" inputmode="tel" value="${esc(s.phone)}"></label>
          <label class="field span-2"><span>Email</span><input class="input" name="email" type="email" value="${esc(s.email)}"></label>
          <label class="field span-2"><span>Notes</span><textarea class="textarea" name="notes">${esc(s.notes)}</textarea></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>`,
      });
      el.querySelector('[data-ok]').onclick = async () => {
        const v = formValues(el.querySelector('[data-f]'));
        if (!v.name) return toast('Supplier name is required.', 'error');
        await store.set('suppliers', sup?.id || uid(10), v);
        toast('Supplier saved.', 'success');
        close();
      };
    }

    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        render();
      })
    );
    $('[data-add]').onclick = () => (tab === 'suppliers' ? editSupplier(null) : editItem(null));
    $('[data-export]').onclick = () => {
      const rows = [['Item', 'Stock', 'Unit', 'Low alert', 'Unit cost', 'Supplier']];
      live.inventory.forEach((i) => rows.push([i.name, i.stock, i.unit, i.lowAt, i.cost, supName(i.supplierId)]));
      downloadFile(`inventory-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    };
    const unsubs = [
      live.on(['inventory', 'products'], render),
      store.watch('stockMoves', (m) => ((moves = m), tab === 'moves' && render()), { since: Date.now() - 90 * 86400000 }),
      store.watch('suppliers', (s) => ((suppliers = s.sort((a, b) => a.name.localeCompare(b.name))), render())),
    ];
    return () => unsubs.forEach((u) => u());
  },
};
