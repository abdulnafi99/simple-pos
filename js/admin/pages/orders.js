// TAPJERR.io — Centralised order management
import { icon } from '../../core/icons.js';
import { esc, money, debounce, toCSV, downloadFile, fmtDateTime, isoDate, rangeOf } from '../../core/utils.js';
import { emptyState, skeleton } from '../../core/ui.js';
import { orderTypeLabel, paymentMethodName, STATUS_META, PAYMENT_META, SOURCE_LABEL } from '../../core/orders.js';
import { pageHead, orderRow, openOrderDetail, rangeControl, bindRange } from '../common.js';

const TABS = [
  ['all', 'All Orders', () => true],
  ['dine-in', 'Dine-in', (o) => o.type === 'dine-in' && o.source !== 'qr'],
  ['qr', 'Table QR Orders', (o) => o.source === 'qr'],
  ['takeaway', 'Takeaway', (o) => o.type === 'takeaway'],
  ['pending', 'Pending', (o) => ['new', 'confirmed'].includes(o.status)],
  ['preparing', 'Preparing', (o) => o.status === 'preparing'],
  ['ready', 'Ready', (o) => o.status === 'ready'],
  ['completed', 'Completed', (o) => o.status === 'completed'],
  ['cancelled', 'Cancelled', (o) => o.status === 'cancelled'],
  ['verify', 'Verify Payment', (o) => o.paymentStatus === 'pending_verification'],
];
const WINDOW_MS = 60 * 86400000;

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let tab = ctx.params.get('tab') || 'all';
    let q = '';
    let range = rangeOf(['pending', 'preparing', 'ready', 'verify'].includes(tab) ? 'week' : 'today');
    let rangeName = ['pending', 'preparing', 'ready', 'verify'].includes(tab) ? 'week' : 'today';
    let extra = null; // orders fetched for ranges older than the live window

    root.innerHTML = `
      ${pageHead('Orders', 'Every order from POS, table QR and online takeaway — updated in real time.', `<button class="btn btn-outline" data-export>${icon('download', 18)} Export CSV</button>`)}
      <div class="row between wrap mb">${rangeControl(rangeName)}
        <div class="input-icon" style="min-width:240px">${icon('search', 18)}<input class="input" placeholder="Order no, customer, phone, table" data-q></div></div>
      <div class="tabs mb" data-tabs></div>
      <div data-list></div>`;
    const $ = (s) => root.querySelector(s);

    async function source() {
      if (range[0] >= Date.now() - WINDOW_MS) return live.orders;
      if (!extra || extra.key !== range.join('-')) {
        $('[data-list]').innerHTML = `<div class="card">${skeleton(5)}</div>`;
        const list = await store.list('orders', { since: range[0], until: range[1] });
        extra = { key: range.join('-'), list: list.sort((a, b) => b.createdAt - a.createdAt) };
      }
      return extra.list;
    }

    function filtered(all) {
      const inR = all.filter((o) => o.createdAt >= range[0] && o.createdAt <= range[1]);
      const s = q.toLowerCase();
      const searched = s
        ? inR.filter((o) => [o.orderNo, o.customer?.name, o.customer?.phone, o.tableNumber && 'table ' + o.tableNumber, o.paymentRef].filter(Boolean).some((x) => String(x).toLowerCase().includes(s)))
        : inR;
      return searched;
    }

    async function render() {
      const all = filtered(await source());
      $('[data-tabs]').innerHTML = TABS.map(([id, label, fn]) => {
        const n = all.filter(fn).length;
        return `<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}">${esc(label)} <span class="badge ${id === 'verify' && n ? 'tone-amber' : ''}">${n}</span></button>`;
      }).join('');
      root.querySelectorAll('[data-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          tab = b.dataset.tab;
          history.replaceState(null, '', `#/orders?tab=${tab}`);
          render();
        })
      );
      const fn = TABS.find((t) => t[0] === tab)?.[2] || (() => true);
      const list = all.filter(fn);
      $('[data-list]').innerHTML = list.length
        ? `<div class="order-list">${list.slice(0, 300).map((o) => orderRow(o)).join('')}</div>${list.length > 300 ? `<p class="small muted center mt">Showing 300 of ${list.length}. Narrow the date range or export CSV.</p>` : ''}`
        : `<div class="card">${emptyState({ iconName: 'receipt-text', title: tab === 'all' ? 'No Orders Yet' : 'No orders here', text: 'Orders will display here once you have some.' })}</div>`;
      root.querySelectorAll('[data-order]').forEach((b) =>
        b.addEventListener('click', () => {
          if (!live.orders.find((o) => o.id === b.dataset.order)) live.data.orders = [...live.orders, ...(extra?.list || []).filter((o) => o.id === b.dataset.order)];
          openOrderDetail(b.dataset.order, ctx);
        })
      );
      return list;
    }

    bindRange(root, (st) => {
      range = st.range;
      rangeName = st.name;
      render();
    });
    $('[data-q]').addEventListener(
      'input',
      debounce((e) => {
        q = e.target.value.trim();
        render();
      }, 150)
    );
    $('[data-export]').addEventListener('click', async () => {
      const fn = TABS.find((t) => t[0] === tab)?.[2] || (() => true);
      const list = filtered(await source()).filter(fn);
      const s = live.settings;
      const rows = [['Order No', 'Date', 'Source', 'Type', 'Table', 'Customer', 'Phone', 'Items', 'Subtotal', 'Discount', 'Service', 'Tax', 'Total', 'Payment Method', 'Payment Status', 'Reference', 'Status', 'Cashier', 'Demo']];
      list.forEach((o) =>
        rows.push([
          o.orderNo,
          fmtDateTime(o.createdAt),
          SOURCE_LABEL[o.source] || o.source,
          orderTypeLabel(o),
          o.tableNumber,
          o.customer?.name,
          o.customer?.phone,
          o.items.map((i) => `${i.qty}x ${i.name}${i.options?.length ? ' (' + i.options.map((x) => x.name).join('/') + ')' : ''}`).join('; '),
          o.subtotal,
          o.discount?.amount || 0,
          o.serviceCharge || 0,
          o.tax || 0,
          o.total,
          paymentMethodName(s, o.paymentMethod),
          PAYMENT_META[o.paymentStatus]?.label,
          o.paymentRef,
          STATUS_META[o.status]?.label,
          o.cashierName,
          o.demo ? 'yes' : '',
        ])
      );
      downloadFile(`orders-${tab}-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    });

    const unsub = live.on('orders', render);
    return unsub;
  },
};

export { money };
