// TAPJERR.io — shared admin widgets: headers, badges, order detail drawer, date filter.
import { icon } from '../core/icons.js';
import { esc, money, fmtDateTime, fmtTime, timeAgo, rangeOf, isoDate } from '../core/utils.js';
import { openModal, toast, confirmDialog, withBusy } from '../core/ui.js';
import {
  STATUS_META,
  PAYMENT_META,
  SOURCE_LABEL,
  nextStatus,
  updateStatus,
  markPaid,
  setPaymentStatus,
  orderTypeLabel,
  paymentMethodName,
  itemCount,
  isOpen,
} from '../core/orders.js';
import { receiptHTML, printReceipt } from '../core/receipt.js';

export function pageHead(title, sub = '', actions = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
}

export const statusBadge = (s) => {
  const m = STATUS_META[s] || { label: s, tone: 'gray' };
  return `<span class="badge tone-${m.tone}"><span class="dot"></span>${esc(m.label)}</span>`;
};
export const payBadge = (s) => {
  const m = PAYMENT_META[s] || { label: s, tone: 'gray' };
  return `<span class="badge tone-${m.tone}">${esc(m.label)}</span>`;
};
export const typeBadge = (o) =>
  `<span class="badge ${o.type === 'dine-in' ? 'tone-indigo' : 'tone-blue'}">${icon(o.type === 'dine-in' ? 'utensils' : 'shopping-bag', 13)} ${esc(orderTypeLabel(o))}</span>`;

export function itemsSummary(o) {
  return o.items.map((i) => `${i.qty}× ${i.name}`).join(', ');
}

export function orderRow(o, selected = false) {
  return `<button class="order-row ${selected ? 'selected' : ''}" data-order="${esc(o.id)}">
    <div><div class="on">${esc(o.orderNo)}</div><div class="tiny muted">${esc(fmtTime(o.createdAt))} · ${esc(timeAgo(o.createdAt))}</div></div>
    <div>${typeBadge(o)}<div class="tiny muted" style="margin-top:4px">${esc(o.customer?.name || SOURCE_LABEL[o.source] || '')}</div></div>
    <div class="items">${esc(itemsSummary(o))}</div>
    <div class="row gap-sm">${statusBadge(o.status)}${payBadge(o.paymentStatus)}</div>
    <div class="amt">${money(o.total)}</div>
  </button>`;
}

/** Date range control. Returns html; bind with bindRange(). */
export function rangeControl(current = 'today', custom = {}) {
  const opts = [
    ['today', 'Today'],
    ['yesterday', 'Yesterday'],
    ['week', 'This Week'],
    ['month', 'This Month'],
    ['custom', 'Custom'],
  ];
  return `<div class="row wrap" data-range>
    <div class="seg">${opts.map(([v, l]) => `<button data-r="${v}" class="${v === current ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="row gap-sm ${current === 'custom' ? '' : 'hidden'}" data-custom>
      <input type="date" class="input" style="height:40px;width:auto" data-from value="${esc(custom.from || isoDate())}" max="${isoDate()}">
      <span class="muted">to</span>
      <input type="date" class="input" style="height:40px;width:auto" data-to value="${esc(custom.to || isoDate())}" max="${isoDate()}">
    </div>
  </div>`;
}
export function bindRange(root, onChange) {
  const box = root.querySelector('[data-range]');
  if (!box) return;
  const state = { name: box.querySelector('.active')?.dataset.r || 'today', from: box.querySelector('[data-from]').value, to: box.querySelector('[data-to]').value };
  const fire = () => onChange({ ...state, range: rangeOf(state.name, state) });
  box.querySelectorAll('[data-r]').forEach((b) =>
    b.addEventListener('click', () => {
      box.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('active', x === b));
      state.name = b.dataset.r;
      box.querySelector('[data-custom]').classList.toggle('hidden', state.name !== 'custom');
      fire();
    })
  );
  box.querySelectorAll('input').forEach((i) =>
    i.addEventListener('change', () => {
      state.from = box.querySelector('[data-from]').value;
      state.to = box.querySelector('[data-to]').value;
      if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      fire();
    })
  );
}

/** Full order detail modal with status / payment actions. Live-updates while open. */
export function openOrderDetail(orderId, ctx) {
  const { live, user } = ctx;
  let order = live.orders.find((o) => o.id === orderId);
  if (!order) {
    toast('Order not found (it may be older than the live window — use Reports).', 'warning');
    return;
  }
  const s = () => live.settings;
  const { el, close } = openModal({ title: order.orderNo, size: 'lg', body: '<div data-od></div>', className: 'order-detail' });
  const render = () => {
    const o = order;
    const ns = nextStatus(o.status);
    const canAct = ctx.role !== 'kitchen';
    el.querySelector('[data-od]').innerHTML = `
      <div class="row wrap gap-sm mb">${statusBadge(o.status)}${payBadge(o.paymentStatus)}${typeBadge(o)}<span class="badge">${esc(SOURCE_LABEL[o.source] || o.source)}</span>${o.demo ? '<span class="badge tone-amber">Demo data</span>' : ''}</div>
      <div class="form-grid">
        <div class="card flat">
          <h4 class="mb">Items (${itemCount(o.items)})</h4>
          <div class="od-items">${o.items
            .map(
              (i) => `<div class="od-item"><div class="row top"><span class="q">${i.qty}×</span><div><b>${esc(i.name)}</b>
                ${i.options?.length ? `<div class="tiny muted">${esc(i.options.map((x) => x.name).join(' · '))}</div>` : ''}
                ${i.note ? `<div class="tiny" style="color:var(--amber)">Note: ${esc(i.note)}</div>` : ''}</div></div>
                <span class="tnum">${money(i.price * i.qty)}</span></div>`
            )
            .join('')}</div>
          <hr class="divider">
          <div class="totals">
            <div class="row"><span class="muted">Subtotal</span><span>${money(o.subtotal)}</span></div>
            ${o.discount?.amount ? `<div class="row"><span class="muted">Discount ${esc(o.discount.label || '')}</span><span>-${money(o.discount.amount)}</span></div>` : ''}
            ${o.serviceCharge ? `<div class="row"><span class="muted">Service charge</span><span>${money(o.serviceCharge)}</span></div>` : ''}
            ${o.tax ? `<div class="row"><span class="muted">${esc(s().taxLabel)}</span><span>${money(o.tax)}</span></div>` : ''}
            ${o.rounding ? `<div class="row"><span class="muted">Rounding</span><span>${money(o.rounding)}</span></div>` : ''}
            <div class="row grand"><span>Total</span><span>${money(o.total)}</span></div>
          </div>
          ${o.note ? `<div class="kds-note" style="margin:12px 0 0">${icon('message-square', 14)} ${esc(o.note)}</div>` : ''}
        </div>
        <div class="col">
          <div class="card flat"><dl class="kv">
            <dt>Order time</dt><dd>${esc(fmtDateTime(o.createdAt))}</dd>
            <dt>Type</dt><dd>${esc(orderTypeLabel(o))}${o.guests ? ` · ${o.guests} pax` : ''}</dd>
            ${o.pickupAt ? `<dt>Pickup</dt><dd>${esc(fmtDateTime(o.pickupAt))}</dd>` : ''}
            <dt>Customer</dt><dd>${esc(o.customer?.name || '—')}</dd>
            <dt>Phone</dt><dd>${o.customer?.phone ? `<a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>` : '—'}</dd>
            <dt>Payment</dt><dd>${esc(paymentMethodName(s(), o.paymentMethod))}</dd>
            ${o.paymentRef ? `<dt>Reference</dt><dd class="mono">${esc(o.paymentRef)}</dd>` : ''}
            ${o.cashierName ? `<dt>Cashier</dt><dd>${esc(o.cashierName)}</dd>` : ''}
          </dl></div>
          <div class="card flat"><h4 class="mb small muted">Timeline</h4><ul class="timeline">${(o.statusHistory || [])
            .map((h) => `<li><i style="background:var(--${STATUS_META[h.status]?.tone === 'gray' ? 'muted' : 'primary'})"></i><b>${esc(STATUS_META[h.status]?.label || h.status)}</b><span class="muted">${esc(fmtTime(h.at))} · ${esc(h.by || '')}</span></li>`)
            .join('')}</ul></div>
        </div>
      </div>
      <div class="status-actions mt">
        ${ns && o.status !== 'cancelled' ? `<button class="btn btn-primary" data-next="${ns}">${icon(STATUS_META[ns].icon, 18)} Mark ${esc(STATUS_META[ns].label)}</button>` : ''}
        ${canAct && o.paymentStatus === 'pending_verification' ? `<button class="btn btn-success" data-verify>${icon('badge-check', 18)} Verify payment</button><button class="btn btn-outline" data-reject>Payment not received</button>` : ''}
        ${canAct && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' ? `<button class="btn btn-success" data-pay>${icon('wallet', 18)} Take payment</button>` : ''}
        <button class="btn btn-outline" data-print>${icon('printer', 18)} Receipt</button>
        ${canAct && isOpen(o) && ctx.can('cancelOrder') ? `<button class="btn btn-ghost" style="color:var(--red)" data-cancel>${icon('circle-x', 18)} Cancel order</button>` : ''}
        ${o.paymentStatus === 'paid' && ctx.can('refundOrder') ? `<button class="btn btn-ghost" data-refund>${icon('undo-2', 18)} Mark refunded</button>` : ''}
        ${!ns || o.status === 'cancelled' ? '' : ''}
      </div>
      <details class="mt"><summary class="small muted" style="cursor:pointer">Status override</summary>
        <div class="row wrap mt">${Object.keys(STATUS_META)
          .filter((k) => k !== o.status && (ctx.role !== 'kitchen' || ['new', 'preparing', 'ready'].includes(k)))
          .map((k) => `<button class="btn btn-sm btn-outline" data-set="${k}">${esc(STATUS_META[k].label)}</button>`)
          .join('')}</div></details>`;
    bind();
  };
  const bind = () => {
    const by = user.name;
    el.querySelectorAll('[data-next],[data-set]').forEach((b) =>
      b.addEventListener('click', () =>
        withBusy(b, async () => {
          const st = b.dataset.next || b.dataset.set;
          if (st === 'cancelled' && !(await confirmDialog({ title: 'Cancel this order?', message: `${order.orderNo} will be marked cancelled.`, confirmText: 'Cancel order', danger: true }))) return;
          order = await updateStatus(order, st, by, s());
          toast(`${order.orderNo} → ${STATUS_META[st].label}`, 'success');
        })
      )
    );
    el.querySelector('[data-verify]')?.addEventListener('click', (e) =>
      withBusy(e.currentTarget, async () => {
        order = await markPaid(order, { method: order.paymentMethod, by, settings: s() });
        toast('Payment verified and marked as paid.', 'success');
      })
    );
    el.querySelector('[data-reject]')?.addEventListener('click', (e) =>
      withBusy(e.currentTarget, async () => {
        order = await setPaymentStatus(order, 'unpaid', by);
        toast('Payment marked as not received. Collect payment at the counter.', 'warning');
      })
    );
    el.querySelector('[data-pay]')?.addEventListener('click', () => openPayment(order, ctx, (o) => (order = o)));
    el.querySelector('[data-print]')?.addEventListener('click', () => printReceipt(order, s()));
    el.querySelector('[data-cancel]')?.addEventListener('click', async (e) => {
      if (!(await confirmDialog({ title: 'Cancel this order?', message: `${order.orderNo} will be marked cancelled and removed from the kitchen.`, confirmText: 'Cancel order', danger: true }))) return;
      withBusy(e.currentTarget, async () => {
        order = await updateStatus(order, 'cancelled', by, s());
        toast(`${order.orderNo} cancelled.`, 'success');
      });
    });
    el.querySelector('[data-refund]')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Mark as refunded?', message: 'Record that this payment was refunded to the customer.', confirmText: 'Mark refunded', danger: true }))) return;
      order = await setPaymentStatus(order, 'refunded', by);
      toast('Order marked as refunded.', 'success');
    });
  };
  render();
  const unsub = live.on('orders', () => {
    const fresh = live.orders.find((o) => o.id === orderId);
    if (fresh && fresh.updatedAt !== order.updatedAt) {
      order = fresh;
      if (document.body.contains(el)) render();
    }
  });
  const obs = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      unsub();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });
  return { close };
}

/** Payment modal used by POS (new order) and for settling unpaid orders. */
export function paymentModal({ total, settings, title = 'Take payment', onConfirm }) {
  const methods = settings.paymentMethods.filter((m) => m.enabled);
  let method = methods[0]?.id;
  const cashRound = (t) => (settings.cashRounding ? Math.round(t * 20) / 20 : t);
  const { el, close } = openModal({
    title,
    size: 'md',
    body: `
      <div class="center mb"><div class="muted small">Amount due</div><div style="font-size:38px;font-weight:750;letter-spacing:-.02em" data-due>${money(total)}</div></div>
      <div class="pay-methods">${methods
        .map((m) => `<button class="pay-method ${m.id === method ? 'active' : ''}" data-m="${esc(m.id)}">${icon(m.type === 'cash' ? 'banknote' : m.type === 'qr' ? 'qr-code' : m.type === 'transfer' ? 'landmark' : 'credit-card', 24)}${esc(m.name)}</button>`)
        .join('')}</div>
      <div class="mt" data-extra></div>`,
    footer: `<button class="btn btn-ghost" data-close>Back</button><button class="btn btn-success btn-lg" data-ok>${icon('check', 20)} Confirm payment</button>`,
  });
  const extra = el.querySelector('[data-extra]');
  const renderExtra = () => {
    const m = methods.find((x) => x.id === method);
    const due = m?.type === 'cash' ? cashRound(total) : total;
    el.querySelector('[data-due]').textContent = money(due);
    if (m?.type === 'cash') {
      const quick = [...new Set([due, Math.ceil(due), Math.ceil(due / 5) * 5, Math.ceil(due / 10) * 10, Math.ceil(due / 50) * 50, 100])].filter((v) => v >= due).slice(0, 5);
      extra.innerHTML = `<label class="field"><span>Cash received</span><input class="input" type="number" inputmode="decimal" step="0.05" min="0" data-cash value="${due.toFixed(2)}"></label>
        <div class="cash-quick mt">${quick.map((v) => `<button class="btn btn-sm btn-outline" data-q="${v}">${money(v)}</button>`).join('')}</div>
        <div class="row between mt"><span class="muted">Change</span><b data-change style="font-size:20px">${money(0)}</b></div>`;
      const inp = extra.querySelector('[data-cash]');
      const upd = () => {
        const c = Number(inp.value) - due;
        extra.querySelector('[data-change]').textContent = money(Math.max(0, c));
        extra.querySelector('[data-change]').style.color = c < 0 ? 'var(--red)' : '';
      };
      inp.addEventListener('input', upd);
      extra.querySelectorAll('[data-q]').forEach((b) =>
        b.addEventListener('click', () => {
          inp.value = Number(b.dataset.q).toFixed(2);
          upd();
        })
      );
      upd();
    } else if (m?.type === 'qr' || m?.type === 'transfer') {
      extra.innerHTML = `${m.qrImage ? `<img src="${esc(m.qrImage)}" alt="DuitNow QR" style="width:180px;margin:0 auto 12px;border-radius:12px">` : ''}
        ${m.type === 'transfer' && (m.bank || m.accountNo) ? `<div class="card flat small mb"><b>${esc(m.bank)}</b><br>${esc(m.accountName)}<br><span class="mono">${esc(m.accountNo)}</span></div>` : ''}
        <label class="field"><span>Transaction reference <span class="hint">(required — confirm the money has arrived)</span></span><input class="input" data-ref placeholder="e.g. DN2611120001234" maxlength="80"></label>`;
    } else {
      extra.innerHTML = `<label class="field"><span>Reference (optional)</span><input class="input" data-ref placeholder="Approval code / last 4 digits" maxlength="80"></label>`;
    }
  };
  el.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      method = b.dataset.m;
      el.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x === b));
      renderExtra();
    })
  );
  renderExtra();
  el.querySelector('[data-ok]').addEventListener('click', (e) => {
    const m = methods.find((x) => x.id === method);
    if (!m) return toast('Enable at least one payment method in Settings.', 'error');
    const payload = { method, ref: '', cashReceived: null };
    if (m.type === 'cash') {
      const cash = Number(extra.querySelector('[data-cash]').value);
      if (!(cash >= cashRound(total) - 0.001)) {
        extra.querySelector('[data-cash]').classList.add('invalid');
        return toast('Cash received is less than the amount due.', 'error');
      }
      payload.cashReceived = cash;
    } else {
      const ref = extra.querySelector('[data-ref]')?.value.trim() || '';
      if ((m.type === 'qr' || m.type === 'transfer') && !ref) {
        extra.querySelector('[data-ref]').classList.add('invalid');
        return toast('Enter the transaction reference after confirming the payment was received.', 'error');
      }
      payload.ref = ref;
    }
    withBusy(e.currentTarget, async () => {
      await onConfirm(payload);
      close();
    });
  });
  return { el, close };
}

export function openPayment(order, ctx, onDone) {
  paymentModal({
    total: order.total,
    settings: ctx.live.settings,
    title: `Payment · ${order.orderNo}`,
    onConfirm: async (p) => {
      const o = await markPaid(order, { ...p, by: ctx.user.name, settings: ctx.live.settings });
      toast(`${order.orderNo} paid.`, 'success');
      onDone?.(o);
      showReceipt(o, ctx.live.settings);
    },
  });
}

export function showReceipt(order, settings, extraTitle = 'Payment successful') {
  const { el } = openModal({
    title: '',
    size: 'sm',
    body: `<div class="paid-check">${icon('check', 40)}</div><h3 class="center">${esc(extraTitle)}</h3>
      <p class="center muted mb">${esc(order.orderNo)} · ${money(order.total)}</p>${receiptHTML(order, settings)}`,
    footer: `<button class="btn btn-outline" data-print>${icon('printer', 18)} Print</button><button class="btn btn-primary" data-close>Done</button>`,
  });
  el.querySelector('[data-print]').onclick = () => printReceipt(order, settings);
}

export function lowStock(inv) {
  return inv.filter((i) => Number(i.stock) <= Number(i.lowAt));
}

export { receiptHTML };
