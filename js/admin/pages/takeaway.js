// TAPJERR.io — Takeaway / Tapau management
import { icon } from '../../core/icons.js';
import { esc, money, fmtTime, fmtDateTime, isoDate, pad, validPhone, normalizePhone, startOfDay, round2 } from '../../core/utils.js';
import { openModal, toast, withBusy, emptyState } from '../../core/ui.js';
import { createOrder, updateStatus, nextStatus, STATUS_META, computeTotals, unitPrice } from '../../core/orders.js';
import { productImage } from '../../core/seed.js';
import { pageHead, payBadge, openOrderDetail, paymentModal, showReceipt } from '../common.js';
import { optionsModal } from './pos.js';

const COLS = ['new', 'confirmed', 'preparing', 'ready', 'completed'];

export function whatsappReady(o, settings) {
  if (!o.customer?.phone) return '';
  const intl = '6' + normalizePhone(o.customer.phone);
  const msg = `Hi ${o.customer.name || ''}! Your ${settings.name} order ${o.orderNo} is READY for pickup. See you soon! ☕`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}

export default {
  render(root, ctx) {
    const { live } = ctx;
    let showAll = false;
    root.innerHTML = `
      ${pageHead('Takeaway / Tapau', 'Walk-in and online pickup orders, from new to collected.', `<label class="check small"><input type="checkbox" data-all> Show all days</label><button class="btn btn-primary" data-new>${icon('plus', 18)} New takeaway order</button>`)}
      <div class="mini-stats mb" data-stats></div>
      <div class="kanban" data-board></div>`;
    const $ = (s) => root.querySelector(s);

    function list() {
      const t0 = startOfDay().getTime();
      return live.orders.filter((o) => o.type === 'takeaway' && (showAll || o.createdAt >= t0 || (o.pickupAt && o.pickupAt >= t0) || !['completed', 'cancelled'].includes(o.status)));
    }

    function render() {
      const all = list();
      const prep = live.settings.prepMinutes || 15;
      const c = (s) => all.filter((o) => o.status === s).length;
      $('[data-stats]').innerHTML = `
        <div class="card mini"><span class="mini-icon tone-blue">${icon('bell-ring', 20)}</span><div><b>${c('new')}</b><span>New orders</span></div></div>
        <div class="card mini"><span class="mini-icon tone-amber">${icon('chef-hat', 20)}</span><div><b>${c('confirmed') + c('preparing')}</b><span>In progress</span></div></div>
        <div class="card mini"><span class="mini-icon tone-green">${icon('package-check', 20)}</span><div><b>${c('ready')}</b><span>Ready for pickup</span></div></div>
        <div class="card mini"><span class="mini-icon tone-red">${icon('circle-x', 20)}</span><div><b>${c('cancelled')}</b><span>Cancelled</span></div></div>`;
      $('[data-board]').innerHTML = COLS.map((st) => {
        const items = all.filter((o) => o.status === st).sort((a, b) => (a.pickupAt || a.createdAt) - (b.pickupAt || b.createdAt));
        return `<div class="kan-col"><h4><span class="row gap-sm">${icon(STATUS_META[st].icon, 16)} ${STATUS_META[st].label === 'Ready' ? 'Ready for Pickup' : STATUS_META[st].label}</span><span class="badge tone-${STATUS_META[st].tone}">${items.length}</span></h4>
          ${
            items.length
              ? items
                  .map((o) => {
                    const eta = o.pickupAt || o.createdAt + prep * 60000;
                    const late = st !== 'completed' && Date.now() > eta;
                    const ns = nextStatus(o.status);
                    const wa = st === 'ready' ? whatsappReady(o, live.settings) : '';
                    return `<div class="kan-card">
                  <button style="border:0;background:none;padding:0;text-align:left" data-o="${esc(o.id)}">
                    <div class="row between"><b>${esc(o.orderNo)}</b>${payBadge(o.paymentStatus)}</div>
                    <div class="small"><b>${esc(o.customer?.name || 'Walk-in')}</b>${o.customer?.phone ? ` · ${esc(o.customer.phone)}` : ''}</div>
                    <div class="tiny ${late ? '' : 'muted'}" style="${late ? 'color:var(--red);font-weight:600' : ''}">${icon('clock', 12)} ${o.pickupAt ? 'Pickup' : 'Est. ready'} ${esc(o.pickupAt && new Date(o.pickupAt).toDateString() !== new Date().toDateString() ? fmtDateTime(eta) : fmtTime(eta))}${late ? ' · overdue' : ''}</div>
                    <div class="small muted" style="margin-top:4px">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</div>
                    ${o.note ? `<div class="tiny" style="color:var(--amber)">“${esc(o.note)}”</div>` : ''}
                    <div class="row between mt"><span class="badge">${o.source === 'online' ? 'Online' : 'Walk-in'}</span><b class="tnum">${money(o.total)}</b></div>
                  </button>
                  <div class="row">
                    ${ns ? `<button class="btn btn-sm btn-soft grow" data-adv="${esc(o.id)}" data-to="${ns}">${esc(STATUS_META[ns].short)} ${icon('arrow-right', 14)}</button>` : ''}
                    ${wa ? `<a class="btn btn-sm btn-outline" href="${esc(wa)}" target="_blank" rel="noopener" title="Notify via WhatsApp">${icon('message-circle', 14)}</a>` : ''}
                  </div></div>`;
                  })
                  .join('')
              : `<p class="tiny muted center" style="padding:20px 0">No orders</p>`
          }</div>`;
      }).join('');
      root.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => openOrderDetail(b.dataset.o, ctx)));
      root.querySelectorAll('[data-adv]').forEach((b) =>
        b.addEventListener('click', () =>
          withBusy(b, async () => {
            const o = live.orders.find((x) => x.id === b.dataset.adv);
            if (b.dataset.to === 'completed' && o.paymentStatus !== 'paid') {
              toast('Collect payment before completing this order.', 'warning');
              return openOrderDetail(o.id, ctx);
            }
            await updateStatus(o, b.dataset.to, ctx.user.name, live.settings);
            toast(`${o.orderNo} → ${STATUS_META[b.dataset.to].label}`, 'success');
            if (b.dataset.to === 'ready' && o.customer?.phone) toast('Customer sees "Ready" live on their tracking page. Tap the chat icon to also notify via WhatsApp.', 'info', { timeout: 5000 });
          })
        )
      );
    }

    function newOrder() {
      const s = live.settings;
      const prep = s.prepMinutes || 15;
      const soon = new Date(Date.now() + prep * 60000);
      const cart = [];
      const products = live.products.filter((p) => p.enabled !== false && !p.soldOut).sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const { el, close } = openModal({
        title: 'New takeaway order',
        size: 'lg',
        body: `<form class="form" data-f novalidate>
          <div class="form-grid">
            <label class="field"><span>Customer name *</span><input class="input" name="name" required maxlength="80"></label>
            <label class="field"><span>Phone number *</span><input class="input" name="phone" inputmode="tel" required placeholder="012-345 6789"></label>
            <label class="field"><span>Pickup date</span><input class="input" type="date" name="date" min="${isoDate()}" value="${isoDate()}"></label>
            <label class="field"><span>Pickup time</span><input class="input" type="time" name="time" value="${pad(soon.getHours())}:${pad(soon.getMinutes())}"></label>
          </div>
          <div><div class="label mb">Menu selection *</div>
            <div class="product-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${products
              .map((p) => `<button type="button" class="product-card" data-p="${esc(p.id)}"><img src="${esc(productImage(p))}" alt=""><div class="pc-body"><span class="pc-name small">${esc(p.name)}</span><span class="pc-price small">${money(p.price)}</span></div></button>`)
              .join('')}</div></div>
          <div class="card flat" data-cart></div>
          <label class="field"><span>Special instructions</span><textarea class="textarea" name="note" maxlength="300" placeholder="Allergies, packaging, etc."></textarea></label>
          <div class="form-grid">
            <label class="field"><span>Payment</span><select class="select" name="pay"><option value="unpaid">Pay at pickup (unpaid)</option><option value="now">Take payment now</option></select></label>
          </div>
        </form>`,
        footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary btn-lg" data-ok>${icon('check', 18)} Create order</button>`,
      });
      const f = el.querySelector('[data-f]');
      const renderCart = () => {
        const t = computeTotals(cart, s, { type: 'takeaway' });
        el.querySelector('[data-cart]').innerHTML = cart.length
          ? `${cart
              .map(
                (i, idx) => `<div class="row between" style="padding:6px 0"><div><b>${i.qty}× ${esc(i.name)}</b>${i.options.length ? `<div class="tiny muted">${esc(i.options.map((o) => o.name).join(' · '))}</div>` : ''}${i.note ? `<div class="tiny" style="color:var(--amber)">${esc(i.note)}</div>` : ''}</div>
            <div class="row gap-sm"><span class="tnum">${money(i.price * i.qty)}</span><div class="qty"><button type="button" data-d="${idx}">${icon('minus', 14)}</button><b>${i.qty}</b><button type="button" data-i="${idx}">${icon('plus', 14)}</button></div></div></div>`
              )
              .join('')}<hr class="divider"><div class="row between"><b>Total</b><b class="tnum" style="font-size:18px">${money(t.total)}</b></div>`
          : `<p class="muted small center">Tap menu items above to add them.</p>`;
        el.querySelectorAll('[data-d]').forEach((b) =>
          b.addEventListener('click', () => {
            const i = cart[Number(b.dataset.d)];
            i.qty -= 1;
            if (i.qty <= 0) cart.splice(Number(b.dataset.d), 1);
            renderCart();
          })
        );
        el.querySelectorAll('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            cart[Number(b.dataset.i)].qty += 1;
            renderCart();
          })
        );
      };
      el.querySelectorAll('[data-p]').forEach((b) =>
        b.addEventListener('click', () => {
          const p = products.find((x) => x.id === b.dataset.p);
          if (p.optionGroups?.length) optionsModal(p, { settings: s, onSave: (line) => (cart.push(line), renderCart()) });
          else {
            const ex = cart.find((i) => i.productId === p.id && !i.options.length && !i.note);
            if (ex) ex.qty += 1;
            else cart.push({ productId: p.id, name: p.name, price: unitPrice(p, []), qty: 1, options: [], note: '' });
            renderCart();
          }
        })
      );
      renderCart();
      el.querySelector('[data-ok]').addEventListener('click', async (e) => {
        const name = f.name.value.trim();
        const phone = f.phone.value.trim();
        let bad = false;
        f.name.classList.toggle('invalid', !name);
        f.phone.classList.toggle('invalid', !validPhone(phone));
        if (!name || !validPhone(phone)) bad = true;
        if (bad) return toast('Enter the customer name and a valid phone number.', 'error');
        if (!cart.length) return toast('Add at least one menu item.', 'error');
        const pickupAt = new Date(`${f.date.value}T${f.time.value || '00:00'}`).getTime();
        if (!pickupAt || pickupAt < Date.now() - 5 * 60000) return toast('Pickup time must be in the future.', 'error');
        const base = {
          source: 'pos',
          type: 'takeaway',
          customer: { name, phone },
          items: cart,
          pickupAt,
          note: f.note.value.trim(),
          cashier: { id: ctx.user.id, name: ctx.user.name },
          status: 'confirmed',
        };
        if (f.pay.value === 'now') {
          const t = computeTotals(cart, s, { type: 'takeaway' });
          paymentModal({
            total: t.total,
            settings: s,
            onConfirm: async (p) => {
              const o = await createOrder({ ...base, paymentMethod: p.method, paymentStatus: 'paid', paymentRef: p.ref, cashReceived: p.cashReceived }, s);
              if (p.cashReceived != null) await ctx.store.update('orders', o.id, { change: round2(p.cashReceived - o.total) });
              close();
              showReceipt(o, s, 'Takeaway order created');
            },
          });
        } else {
          await withBusy(e.currentTarget, async () => {
            const o = await createOrder({ ...base, paymentStatus: 'unpaid' }, s);
            toast(`${o.orderNo} created for ${name} · pickup ${fmtTime(pickupAt)}`, 'success', { title: 'Takeaway order created' });
            close();
          });
        }
      });
    }

    $('[data-new]').onclick = newOrder;
    $('[data-all]').onchange = (e) => {
      showAll = e.target.checked;
      render();
    };
    const unsub = live.on(['orders', 'settings'], render);
    const tick = setInterval(render, 60000);
    return () => {
      unsub();
      clearInterval(tick);
    };
  },
};

export { emptyState };
