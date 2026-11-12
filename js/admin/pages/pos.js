// TAPJERR.io — POS / Cashier
import { icon } from '../../core/icons.js';
import { esc, money, uid, round2, normalizePhone, validPhone, debounce } from '../../core/utils.js';
import { openModal, toast, emptyState, withBusy } from '../../core/ui.js';
import { productImage } from '../../core/seed.js';
import { computeTotals, createOrder, unitPrice, itemCount, tableState } from '../../core/orders.js';
import { paymentModal, showReceipt } from '../common.js';

const CART_KEY = 'tapjerr:pos-cart';

export function optionsModal(product, { initial = null, onSave, settings }) {
  const groups = product.optionGroups || [];
  const { el, close } = openModal({
    title: '',
    size: 'md',
    body: `
      <div class="row top gap-lg mb">
        <img src="${esc(productImage(product))}" alt="" style="width:96px;height:96px;border-radius:18px;object-fit:cover">
        <div class="grow"><h3>${esc(product.name)}</h3><p class="small muted">${esc(product.description || '')}</p><b class="tnum" style="color:var(--primary)">${money(product.price)}</b></div>
      </div>
      <form data-f>
        ${groups
          .map(
            (g, gi) => `<div class="opt-group"><h4>${esc(g.name)} <span class="tiny ${g.required ? '' : 'muted'}">${g.required ? 'Required' : g.type === 'multi' ? 'Optional · choose any' : 'Optional'}</span></h4>
            <div class="opt-choices">${g.options
              .map((o, oi) => {
                const checked = initial ? initial.options?.some((x) => x.group === g.name && x.name === o.name) : g.required && oi === 0;
                return `<label class="opt-choice"><input type="${g.type === 'multi' ? 'checkbox' : 'radio'}" name="g${gi}" value="${oi}" ${checked ? 'checked' : ''}>
                  <span>${esc(o.name)}${o.price ? ` <small>${o.price > 0 ? '+' : '−'}${money(Math.abs(o.price))}</small>` : ''}</span></label>`;
              })
              .join('')}</div></div>`
          )
          .join('')}
        <label class="field"><span>Notes for kitchen</span><input class="input" name="note" maxlength="200" placeholder="e.g. less ice, extra hot" value="${esc(initial?.note || '')}"></label>
      </form>`,
    footer: `<div class="qty" style="margin-right:auto"><button type="button" data-dec aria-label="Decrease">${icon('minus', 16)}</button><b data-qty>${initial?.qty || 1}</b><button type="button" data-inc aria-label="Increase">${icon('plus', 16)}</button></div>
      <button class="btn btn-primary btn-lg" data-ok>${initial ? 'Update' : 'Add to cart'} · <span data-price></span></button>`,
  });
  let qty = initial?.qty || 1;
  const read = () => {
    const opts = [];
    groups.forEach((g, gi) => {
      el.querySelectorAll(`[name="g${gi}"]:checked`).forEach((inp) => {
        const o = g.options[Number(inp.value)];
        opts.push({ group: g.name, name: o.name, price: Number(o.price) || 0 });
      });
    });
    return opts;
  };
  const upd = () => {
    el.querySelector('[data-qty]').textContent = qty;
    el.querySelector('[data-price]').textContent = money(unitPrice(product, read()) * qty);
  };
  el.querySelector('[data-f]').addEventListener('change', upd);
  el.querySelector('[data-dec]').onclick = () => {
    qty = Math.max(1, qty - 1);
    upd();
  };
  el.querySelector('[data-inc]').onclick = () => {
    qty = Math.min(99, qty + 1);
    upd();
  };
  el.querySelector('[data-f]').addEventListener('submit', (e) => e.preventDefault());
  el.querySelector('[data-ok]').onclick = () => {
    const opts = read();
    const missing = groups.find((g) => g.required && !opts.some((o) => o.group === g.name));
    if (missing) return toast(`Please choose ${missing.name}.`, 'warning');
    onSave({ productId: product.id, name: product.name, image: product.image || '', price: unitPrice(product, opts), qty, options: opts, note: el.querySelector('[name=note]').value.trim() });
    close();
  };
  upd();
  return { el, close };
}

export default {
  fullBleed: true,
  render(root, ctx) {
    const { live } = ctx;
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(CART_KEY) || '{}');
    } catch {
      saved = {};
    }
    const state = {
      items: saved.items || [],
      type: saved.type || 'takeaway',
      tableId: saved.tableId || '',
      guests: saved.guests || 1,
      customer: saved.customer || { name: '', phone: '' },
      discount: saved.discount || null,
      note: saved.note || '',
      cat: 'all',
      q: '',
      showBreakdown: false,
    };
    const qpTable = ctx.params.get('table');
    if (qpTable) {
      state.type = 'dine-in';
      state.tableId = qpTable;
    }
    const persist = () => sessionStorage.setItem(CART_KEY, JSON.stringify({ items: state.items, type: state.type, tableId: state.tableId, guests: state.guests, customer: state.customer, discount: state.discount, note: state.note }));

    root.innerHTML = `
    <div class="split">
      <section class="split-left sheet" data-cart-panel>
        <div class="panel-head" style="justify-content:flex-end">
          <button class="icon-btn" data-close-sheet style="margin-right:auto" aria-label="Close cart">${icon('chevron-down', 22)}</button>
          <button class="btn btn-outline" data-discount title="Discount">${icon('ticket-percent', 20)}</button>
          <button class="btn btn-outline" data-actions>Actions</button>
        </div>
        <div style="padding:0 22px" class="col">
          <div class="pos-mode">
            <button class="btn btn-outline" data-type="takeaway">${icon('shopping-bag', 20)} Pickup</button>
            <button class="btn btn-outline" data-type="dine-in">${icon('utensils', 20)} Dine-in</button>
          </div>
          <div data-dinein class="row"></div>
          <button class="btn btn-soft btn-block" data-member style="height:52px"></button>
        </div>
        <div class="panel-body" data-cart></div>
        <div class="panel-foot">
          <div data-totals></div>
          <div class="row mt">
            <button class="btn btn-outline btn-lg" data-send title="Send to kitchen, pay later">${icon('send', 20)}</button>
            <button class="btn btn-primary btn-lg grow" data-charge>Charge</button>
          </div>
        </div>
      </section>
      <section class="split-right">
        <div class="pos-toolbar">
          <div class="input-icon">${icon('search', 20)}<input class="input" style="height:50px;background:var(--surface);border-color:transparent;box-shadow:var(--shadow-sm)" placeholder="Search" data-search></div>
          ${ctx.can('editMenu') ? `<a class="btn btn-outline" href="#/products">${icon('settings-2', 18)} Manage menu</a>` : ''}
        </div>
        <div class="chips mb" data-cats></div>
        <div data-products></div>
      </section>
      <button class="btn btn-primary btn-lg pos-cart-fab" data-open-sheet></button>
    </div>`;
    const $ = (s) => root.querySelector(s);
    const panel = $('[data-cart-panel]');

    const totals = () => computeTotals(state.items, live.settings, { type: state.type, discount: state.discount });

    function renderCats() {
      const cats = [...live.categories].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const count = (id) => live.products.filter((p) => p.enabled !== false && (id === 'all' || p.categoryId === id)).length;
      $('[data-cats]').innerHTML = [{ id: 'all', name: 'All' }, ...cats].map((c) => `<button class="chip ${state.cat === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">${esc(c.name)} <span class="count">${count(c.id)}</span></button>`).join('');
      root.querySelectorAll('[data-cat]').forEach((b) =>
        b.addEventListener('click', () => {
          state.cat = b.dataset.cat;
          renderCats();
          renderProducts();
        })
      );
    }

    function renderProducts() {
      const box = $('[data-products]');
      if (!live.products.length) {
        box.innerHTML = emptyState({
          iconName: 'shopping-bag',
          title: 'No Item Yet',
          text: 'Start adding your first item and run your business today.',
          action: ctx.can('editMenu') ? `<a class="btn btn-primary btn-lg" href="#/products?new=1">Create Item</a>` : '',
        });
        return;
      }
      const q = state.q.toLowerCase();
      const list = live.products
        .filter((p) => p.enabled !== false)
        .filter((p) => state.cat === 'all' || p.categoryId === state.cat)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
        .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
      const inCart = new Map();
      state.items.forEach((i) => inCart.set(i.productId, (inCart.get(i.productId) || 0) + i.qty));
      box.innerHTML = list.length
        ? `<div class="product-grid">${list
            .map(
              (p) => `<button class="product-card" data-p="${esc(p.id)}" ${p.soldOut ? 'disabled' : ''}>
              <img src="${esc(productImage(p))}" alt="" loading="lazy">
              ${p.soldOut ? '<span class="badge tone-red sold">Sold out</span>' : ''}
              ${inCart.get(p.id) ? `<span class="in-cart">${inCart.get(p.id)}</span>` : ''}
              <div class="pc-body"><span class="pc-name">${esc(p.name)}</span><span class="pc-price">${money(p.price)}</span></div></button>`
            )
            .join('')}</div>`
        : emptyState({ iconName: 'search-x', title: 'No matching items', text: 'Try another search or category.' });
      box.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => addProduct(live.products.find((p) => p.id === b.dataset.p))));
    }

    function addProduct(p) {
      if (!p || p.soldOut) return;
      if (p.optionGroups?.length) {
        optionsModal(p, { settings: live.settings, onSave: (line) => addLine(line) });
      } else addLine({ productId: p.id, name: p.name, image: p.image || '', price: unitPrice(p, []), qty: 1, options: [], note: '' });
    }
    function addLine(line) {
      const key = JSON.stringify([line.productId, line.options, line.note, line.price]);
      const ex = state.items.find((i) => JSON.stringify([i.productId, i.options, i.note, i.price]) === key);
      if (ex) ex.qty = Math.min(99, ex.qty + line.qty);
      else state.items.push({ ...line, key: uid(8) });
      persist();
      renderCart();
      renderProducts();
    }

    function renderCart() {
      root.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
      const dine = $('[data-dinein]');
      if (state.type === 'dine-in') {
        const tables = [...live.tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
        dine.innerHTML = `<select class="select grow" data-table aria-label="Table"><option value="">Select table…</option>${tables
          .map((t) => {
            const st = tableState(t, live.orders).status;
            return `<option value="${esc(t.id)}" ${t.id === state.tableId ? 'selected' : ''}>Table ${esc(t.number)} · ${esc(t.section || '')} ${st !== 'available' ? `(${st})` : ''}</option>`;
          })
          .join('')}</select>
          <div class="qty" title="Guests">${icon('users', 16)}<button data-g="-1" aria-label="Fewer guests">${icon('minus', 14)}</button><b>${state.guests}</b><button data-g="1" aria-label="More guests">${icon('plus', 14)}</button></div>`;
        dine.querySelector('[data-table]').onchange = (e) => {
          state.tableId = e.target.value;
          persist();
        };
        dine.querySelectorAll('[data-g]').forEach((b) =>
          b.addEventListener('click', () => {
            state.guests = Math.max(1, Math.min(30, state.guests + Number(b.dataset.g)));
            persist();
            renderCart();
          })
        );
      } else dine.innerHTML = '';
      $('[data-member]').innerHTML = state.customer.name || state.customer.phone ? `${icon('user-check', 20)} ${esc(state.customer.name || state.customer.phone)}${state.customer.phone && state.customer.name ? ` · ${esc(state.customer.phone)}` : ''}` : `${icon('user-plus', 20)} Add Customer`;

      const cart = $('[data-cart]');
      if (!state.items.length) {
        cart.innerHTML = emptyState({ iconName: 'shopping-basket', title: '', text: 'Add an item to start' });
      } else {
        cart.innerHTML = `<div class="cart-list">${state.items
          .map(
            (i) => `<div class="cart-line">
            <img src="${esc(productImage(live.products.find((p) => p.id === i.productId) || { name: i.name }))}" alt="">
            <div style="min-width:0"><button class="name" style="border:0;background:none;padding:0;text-align:left" data-edit="${i.key}">${esc(i.name)}</button>
              ${i.options?.length ? `<div class="opts">${esc(i.options.map((o) => o.name).join(' · '))}</div>` : ''}
              ${i.note ? `<div class="note">“${esc(i.note)}”</div>` : ''}
              <div class="tnum small muted">${money(i.price)} each</div></div>
            <div class="col" style="align-items:flex-end;gap:6px"><b class="tnum">${money(i.price * i.qty)}</b>
              <div class="qty"><button data-dec="${i.key}" aria-label="Decrease">${icon(i.qty === 1 ? 'trash-2' : 'minus', 14)}</button><b>${i.qty}</b><button data-inc="${i.key}" aria-label="Increase">${icon('plus', 14)}</button></div></div>
          </div>`
          )
          .join('')}</div>
          ${state.note ? `<div class="kds-note" style="margin:12px 0">${icon('message-square', 14)} ${esc(state.note)}</div>` : ''}`;
        cart.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.inc, 1)));
        cart.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.dec, -1)));
        cart.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editLine(b.dataset.edit)));
      }
      const t = totals();
      const s = live.settings;
      $('[data-totals]').innerHTML = `
        <button class="totals-toggle" data-tt><span style="font-size:22px">Total</span><span class="row gap-sm"><b style="font-size:26px" class="tnum">${money(t.total)}</b>${icon(state.showBreakdown ? 'chevron-up' : 'chevron-down', 18)}</span></button>
        ${
          state.showBreakdown
            ? `<div class="totals mt fade-in">
            <div class="row"><span class="muted">Subtotal (${itemCount(state.items)} items)</span><span>${money(t.subtotal)}</span></div>
            ${t.discountAmount ? `<div class="row"><span class="muted">Discount ${esc(state.discount?.label || '')}</span><span>-${money(t.discountAmount)} <button class="icon-btn sm" data-rm-disc aria-label="Remove discount">${icon('x', 14)}</button></span></div>` : ''}
            ${t.service ? `<div class="row"><span class="muted">Service charge (${s.serviceRate}%)</span><span>${money(t.service)}</span></div>` : ''}
            ${t.tax ? `<div class="row"><span class="muted">${esc(s.taxLabel)} (${s.taxRate}%)</span><span>${money(t.tax)}</span></div>` : ''}
          </div>`
            : t.discountAmount
              ? `<div class="tiny muted">Includes discount −${money(t.discountAmount)}</div>`
              : ''
        }`;
      $('[data-tt]').onclick = () => {
        state.showBreakdown = !state.showBreakdown;
        renderCart();
      };
      $('[data-rm-disc]')?.addEventListener('click', () => {
        state.discount = null;
        persist();
        renderCart();
      });
      $('[data-charge]').disabled = !state.items.length;
      $('[data-send]').disabled = !state.items.length;
      $('[data-charge]').textContent = state.items.length ? `Charge ${money(t.total)}` : 'Charge';
      const fab = $('[data-open-sheet]');
      fab.innerHTML = `${icon('shopping-basket', 20)} ${itemCount(state.items)} items · ${money(t.total)}`;
      fab.classList.toggle('hidden', !state.items.length);
    }

    function changeQty(key, d) {
      const i = state.items.find((x) => x.key === key);
      if (!i) return;
      i.qty += d;
      if (i.qty <= 0) state.items = state.items.filter((x) => x.key !== key);
      persist();
      renderCart();
      renderProducts();
    }
    function editLine(key) {
      const line = state.items.find((x) => x.key === key);
      const p = live.products.find((x) => x.id === line.productId);
      if (!p) {
        // custom item: allow editing note
        return customItem(line);
      }
      optionsModal(p, {
        initial: line,
        settings: live.settings,
        onSave: (nl) => {
          Object.assign(line, nl);
          persist();
          renderCart();
          renderProducts();
        },
      });
    }

    function customItem(existing = null) {
      const { el, close } = openModal({
        title: existing ? 'Edit custom item' : 'Custom item',
        size: 'sm',
        body: `<form class="form" data-f>
          <label class="field"><span>Item name</span><input class="input" name="name" required maxlength="60" value="${esc(existing?.name || '')}"></label>
          <label class="field"><span>Price (RM)</span><input class="input" name="price" type="number" step="0.01" min="0" required value="${existing?.price ?? ''}"></label>
          <label class="field"><span>Note</span><input class="input" name="note" maxlength="200" value="${esc(existing?.note || '')}"></label></form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>${existing ? 'Save' : 'Add'}</button>`,
      });
      el.querySelector('[data-ok]').onclick = () => {
        const f = el.querySelector('[data-f]');
        const name = f.name.value.trim();
        const price = Number(f.price.value);
        if (!name || !(price >= 0) || f.price.value === '') return toast('Enter a name and price.', 'error');
        if (existing) Object.assign(existing, { name, price: round2(price), note: f.note.value.trim() });
        else state.items.push({ key: uid(8), productId: 'custom-' + uid(6), custom: true, name, price: round2(price), qty: 1, options: [], note: f.note.value.trim() });
        persist();
        renderCart();
        close();
      };
    }

    function customerModal() {
      const { el, close } = openModal({
        title: 'Customer',
        size: 'sm',
        body: `<form class="form" data-f>
          <label class="field"><span>Name</span><input class="input" name="name" maxlength="80" value="${esc(state.customer.name)}" placeholder="Customer name"></label>
          <label class="field"><span>Phone number</span><input class="input" name="phone" inputmode="tel" value="${esc(state.customer.phone)}" placeholder="012-345 6789"></label>
          <div data-hist class="small muted"></div></form>`,
        footer: `${state.customer.name || state.customer.phone ? '<button class="btn btn-ghost" data-clear>Remove</button>' : ''}<button class="btn btn-primary" data-ok>Save</button>`,
      });
      const f = el.querySelector('[data-f]');
      const lookup = debounce(() => {
        const ph = normalizePhone(f.phone.value);
        if (ph.length < 9) return (el.querySelector('[data-hist]').textContent = '');
        const past = live.orders.filter((o) => o.customer?.phone === ph);
        if (past.length) {
          if (!f.name.value) f.name.value = past[0].customer.name || '';
          el.querySelector('[data-hist]').innerHTML = `${icon('history', 14)} Returning customer · ${past.length} recent order(s)`;
        } else el.querySelector('[data-hist]').textContent = 'New customer';
      }, 250);
      f.phone.addEventListener('input', lookup);
      el.querySelector('[data-clear]')?.addEventListener('click', () => {
        state.customer = { name: '', phone: '' };
        persist();
        renderCart();
        close();
      });
      el.querySelector('[data-ok]').onclick = () => {
        const phone = f.phone.value.trim();
        if (phone && !validPhone(phone)) {
          f.phone.classList.add('invalid');
          return toast('Enter a valid Malaysian phone number.', 'error');
        }
        state.customer = { name: f.name.value.trim(), phone: normalizePhone(phone) };
        persist();
        renderCart();
        close();
      };
    }

    function discountModal() {
      if (!ctx.can('applyDiscount')) return toast('Your role cannot apply discounts.', 'warning');
      const presets = live.settings.discountPresets || [];
      const { el, close } = openModal({
        title: 'Apply discount',
        size: 'sm',
        body: `${presets.length ? `<div class="label mb">Presets</div><div class="row wrap mb">${presets.map((p, i) => `<button class="chip" data-pre="${i}">${esc(p.name)}</button>`).join('')}</div>` : ''}
          <div class="label">Custom</div>
          <div class="row mt"><div class="seg" data-dt><button class="active" data-v="percent">%</button><button data-v="fixed">RM</button></div>
          <input class="input grow" type="number" min="0" step="0.01" data-val placeholder="Value"></div>
          <label class="field mt"><span>Label (optional)</span><input class="input" data-label maxlength="40" placeholder="e.g. Birthday"></label>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Apply</button>`,
      });
      let dtype = 'percent';
      el.querySelectorAll('[data-dt] button').forEach((b) =>
        b.addEventListener('click', () => {
          dtype = b.dataset.v;
          el.querySelectorAll('[data-dt] button').forEach((x) => x.classList.toggle('active', x === b));
        })
      );
      const apply = (d) => {
        state.discount = d;
        state.showBreakdown = true;
        persist();
        renderCart();
        close();
        toast(`Discount applied: ${d.label || (d.type === 'percent' ? d.value + '%' : money(d.value))}`, 'success');
      };
      el.querySelectorAll('[data-pre]').forEach((b) =>
        b.addEventListener('click', () => {
          const p = presets[Number(b.dataset.pre)];
          apply({ type: p.type, value: Number(p.value), label: p.name });
        })
      );
      el.querySelector('[data-ok]').onclick = () => {
        const v = Number(el.querySelector('[data-val]').value);
        if (!(v > 0) || (dtype === 'percent' && v > 100)) return toast('Enter a valid discount value.', 'error');
        apply({ type: dtype, value: v, label: el.querySelector('[data-label]').value.trim() });
      };
    }

    function actionsMenu() {
      const { el, close } = openModal({
        title: 'Actions',
        size: 'sm',
        body: `<div class="col">
          <button class="btn btn-outline btn-block" data-a="custom">${icon('plus', 18)} Add custom item</button>
          <button class="btn btn-outline btn-block" data-a="note">${icon('message-square', 18)} Order note</button>
          <button class="btn btn-outline btn-block" data-a="orders">${icon('clipboard-list', 18)} View open orders</button>
          <button class="btn btn-outline btn-block" style="color:var(--red)" data-a="clear" ${state.items.length ? '' : 'disabled'}>${icon('trash-2', 18)} Clear cart</button></div>`,
      });
      el.querySelectorAll('[data-a]').forEach((b) =>
        b.addEventListener('click', async () => {
          close();
          const a = b.dataset.a;
          if (a === 'custom') customItem();
          if (a === 'orders') ctx.navigate('orders', { tab: 'pending' });
          if (a === 'clear') {
            resetCart();
            toast('Cart cleared.', 'info');
          }
          if (a === 'note') {
            const { promptDialog } = await import('../../core/ui.js');
            const v = await promptDialog({ title: 'Order note', label: 'Note for kitchen / staff', value: state.note });
            if (v != null) {
              state.note = v;
              persist();
              renderCart();
            }
          }
        })
      );
    }

    function resetCart() {
      state.items = [];
      state.discount = null;
      state.note = '';
      state.customer = { name: '', phone: '' };
      state.guests = 1;
      if (!qpTable) state.tableId = '';
      persist();
      renderCart();
      renderProducts();
    }

    function validateBeforeOrder() {
      if (!state.items.length) return false;
      if (state.type === 'dine-in' && !state.tableId) {
        toast('Select a table for dine-in orders.', 'warning');
        $('[data-table]')?.classList.add('invalid');
        return false;
      }
      return true;
    }
    function orderPayload(extra) {
      const table = live.tables.find((t) => t.id === state.tableId);
      return {
        source: 'pos',
        type: state.type,
        tableId: state.type === 'dine-in' ? state.tableId : '',
        tableNumber: state.type === 'dine-in' ? table?.number || '' : '',
        guests: state.type === 'dine-in' ? state.guests : 0,
        customer: state.customer,
        items: state.items.map(({ key, image, ...rest }) => rest),
        discount: state.discount,
        note: state.note,
        cashier: { id: ctx.user.id, name: ctx.user.name },
        ...extra,
      };
    }

    async function markTableOccupied() {
      if (state.type !== 'dine-in' || !state.tableId) return;
      const t = live.tables.find((x) => x.id === state.tableId);
      if (t && (t.status !== 'occupied' || t.guests !== state.guests)) await ctx.store.update('tables', t.id, { status: 'occupied', guests: state.guests, reservedFor: '' }).catch(() => {});
    }

    $('[data-charge]').addEventListener('click', () => {
      if (!validateBeforeOrder()) return;
      const t = totals();
      paymentModal({
        total: t.total,
        settings: live.settings,
        onConfirm: async (p) => {
          const order = await createOrder(orderPayload({ paymentMethod: p.method, paymentStatus: 'paid', paymentRef: p.ref, cashReceived: p.cashReceived, change: p.cashReceived != null ? round2(p.cashReceived - computeTotals(state.items, live.settings, { type: state.type, discount: state.discount, cash: p.method === 'cash' }).total) : null }), live.settings);
          await markTableOccupied();
          resetCart();
          panel.classList.remove('open');
          showReceipt(order, live.settings);
        },
      });
    });
    $('[data-send]').addEventListener('click', (e) => {
      if (!validateBeforeOrder()) return;
      withBusy(e.currentTarget, async () => {
        const order = await createOrder(orderPayload({ paymentStatus: 'unpaid' }), live.settings);
        await markTableOccupied();
        resetCart();
        panel.classList.remove('open');
        toast(`${order.orderNo} sent to kitchen · payment pending.`, 'success', { title: 'Order created' });
      });
    });
    root.querySelectorAll('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        state.type = b.dataset.type;
        persist();
        renderCart();
      })
    );
    $('[data-member]').addEventListener('click', customerModal);
    $('[data-discount]').addEventListener('click', discountModal);
    $('[data-actions]').addEventListener('click', actionsMenu);
    $('[data-search]').addEventListener(
      'input',
      debounce((e) => {
        state.q = e.target.value.trim();
        renderProducts();
      }, 120)
    );
    $('[data-open-sheet]').addEventListener('click', () => panel.classList.add('open'));
    $('[data-close-sheet]').addEventListener('click', () => panel.classList.remove('open'));

    const unsubs = [
      live.on(['products', 'categories'], () => {
        renderCats();
        renderProducts();
        renderCart();
      }),
      live.on(['tables', 'settings'], renderCart),
    ];
    return () => unsubs.forEach((u) => u());
  },
};
