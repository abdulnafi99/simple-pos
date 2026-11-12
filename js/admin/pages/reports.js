// TAPJERR.io — Reports & analytics with CSV / PDF export
import { icon } from '../../core/icons.js';
import { esc, money, rangeOf, fmtDate, fmtDateTime, toCSV, downloadFile, isoDate, num } from '../../core/utils.js';
import { toast, skeleton, emptyState } from '../../core/ui.js';
import { lineChart, donutChart, barChart, SERIES } from '../../core/charts.js';
import { STATUS_META } from '../../core/orders.js';
import { pageHead } from '../common.js';
import { summarize, salesSeries, topProducts, byPayment, byType, byCashier, previousRange, deltaPct } from '../analytics.js';

const PERIODS = [
  ['today', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
  ['year', 'Yearly'],
  ['custom', 'Custom'],
];

export default {
  render(root, ctx) {
    const { live, store } = ctx;
    let period = 'today';
    let custom = { from: isoDate(new Date(Date.now() - 6 * 86400000)), to: isoDate() };
    let data = null;
    let busy = 0;
    root.innerHTML = `
      ${pageHead('Reports & Analytics', 'Sales, products, payments and staff performance.', `<button class="btn btn-outline" data-csv>${icon('file-spreadsheet', 18)} Export CSV</button><button class="btn btn-primary" data-pdf>${icon('file-text', 18)} Export PDF</button>`)}
      <div class="row wrap mb">
        <div class="seg" data-period>${PERIODS.map(([v, l]) => `<button data-p="${v}">${l}</button>`).join('')}</div>
        <div class="row gap-sm hidden" data-custom><input type="date" class="input" style="height:40px;width:auto" data-from value="${custom.from}" max="${isoDate()}"><span class="muted">to</span><input type="date" class="input" style="height:40px;width:auto" data-to value="${custom.to}" max="${isoDate()}"></div>
        <label class="check small"><input type="checkbox" data-nodemo checked> Exclude demo data</label>
        <span class="small muted" data-range-label></span>
      </div>
      <div data-body>${skeleton(6)}</div>`;
    const $ = (s) => root.querySelector(s);

    async function load() {
      const range = rangeOf(period, custom);
      const prev = previousRange(range);
      const my = ++busy;
      $('[data-body]').innerHTML = `<div class="card">${skeleton(6)}</div>`;
      try {
        const list = await store.list('orders', { since: prev[0], until: range[1] });
        if (my !== busy) return;
        data = { range, prev, all: list };
        render();
      } catch (e) {
        $('[data-body]').innerHTML = `<div class="card">${emptyState({ iconName: 'circle-alert', title: 'Could not load report', text: e.message })}</div>`;
      }
    }

    function orders() {
      const nodemo = $('[data-nodemo]').checked;
      return data.all.filter((o) => !nodemo || !o.demo);
    }

    function compute() {
      const all = orders();
      const cur = summarize(all, data.range);
      const prv = summarize(all, data.prev);
      return {
        cur,
        prv,
        series: salesSeries(all, data.range),
        products: topProducts(cur.sales, 1000),
        payments: byPayment(cur.sales, live.settings),
        types: byType(cur.list),
        cashiers: byCashier(cur.sales),
        statuses: Object.keys(STATUS_META).map((s) => ({ label: STATUS_META[s].label, value: cur.list.filter((o) => o.status === s).length })),
      };
    }

    function render() {
      root.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('active', b.dataset.p === period));
      $('[data-custom]').classList.toggle('hidden', period !== 'custom');
      $('[data-range-label]').textContent = `${fmtDate(data.range[0])} – ${fmtDate(data.range[1])}`;
      const r = compute();
      const { cur, prv } = r;
      const d = (a, b) => {
        const v = deltaPct(a, b);
        return `<span class="delta ${v > 0.05 ? 'up' : v < -0.05 ? 'down' : ''}">${v > 0.05 ? icon('trending-up', 13) : v < -0.05 ? icon('trending-down', 13) : ''}${Math.abs(v).toFixed(1)}%</span>`;
      };
      const totalQty = r.products.reduce((a, p) => a + p.qty, 0);
      $('[data-body]').innerHTML = `
        <div class="stat-grid mb">
          ${stat('Net sales', money(cur.revenue), d(cur.revenue, prv.revenue))}
          ${stat('Paid orders', num(cur.paidOrders), d(cur.paidOrders, prv.paidOrders))}
          ${stat('Avg order value', money(cur.avgOrder), d(cur.avgOrder, prv.avgOrder))}
          ${stat('Items sold', num(cur.items), d(cur.items, prv.items))}
        </div>
        <div class="stat-grid">
          <div class="card span-8"><div class="card-head"><h3>Sales trend</h3><span class="small muted">vs previous period: ${money(prv.revenue)}</span></div><div data-c-sales></div></div>
          <div class="card span-4"><div class="card-head"><h3>Payment breakdown</h3></div><div data-c-pay></div></div>
          <div class="card span-6"><div class="card-head"><h3>Order breakdown</h3></div><div data-c-type></div></div>
          <div class="card span-6"><div class="card-head"><h3>Order status</h3></div><div data-c-status></div></div>
          <div class="card span-7"><div class="card-head"><h3>Product performance</h3><span class="small muted">${r.products.length} products</span></div>
            ${r.products.length ? `<div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>#</th><th>Product</th><th class="num">Qty</th><th class="num">Share</th><th class="num">Revenue</th></tr></thead><tbody>${r.products
              .map((p, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(p.name)}</b></td><td class="num">${p.qty}</td><td class="num">${totalQty ? ((p.qty / totalQty) * 100).toFixed(1) : 0}%</td><td class="num">${money(p.revenue)}</td></tr>`)
              .join('')}</tbody></table></div>` : emptyState({ iconName: 'coffee', title: 'No product sales in this period' })}</div>
          <div class="card span-5"><div class="card-head"><h3>Cashier performance</h3></div>
            ${r.cashiers.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Staff / channel</th><th class="num">Orders</th><th class="num">Sales</th><th class="num">Avg</th></tr></thead><tbody>${r.cashiers
              .map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${c.orders}</td><td class="num">${money(c.revenue)}</td><td class="num">${money(c.revenue / c.orders)}</td></tr>`)
              .join('')}</tbody></table></div>` : emptyState({ iconName: 'user', title: 'No sales yet' })}
            <hr class="divider"><div class="totals">
              <div class="row"><span class="muted">Discounts given</span><span>${money(cur.discounts)}</span></div>
              <div class="row"><span class="muted">Service charge collected</span><span>${money(cur.service)}</span></div>
              <div class="row"><span class="muted">${esc(live.settings.taxLabel)} collected</span><span>${money(cur.tax)}</span></div>
              <div class="row"><span class="muted">Cancelled orders</span><span>${cur.cancelled}</span></div></div></div>
        </div>`;
      const s = r.series;
      if (s.unit === 'hour') lineChart($('[data-c-sales]'), { labels: s.labels, series: [{ name: 'Sales', values: s.values }], format: money, height: 260 });
      else barChart($('[data-c-sales]'), { labels: s.labels, values: s.values, format: money, height: 260 });
      donutChart($('[data-c-pay]'), { segments: r.payments.map((p, i) => ({ label: p.label, value: p.value, color: SERIES[i % SERIES.length] })), format: money, center: money(cur.revenue), centerLabel: 'paid', size: 140 });
      donutChart($('[data-c-type]'), { segments: r.types.map((t, i) => ({ ...t, color: SERIES[i] })), format: (v) => `${v}`, center: String(cur.orders), centerLabel: 'orders', size: 140 });
      barChart($('[data-c-status]'), { labels: r.statuses.map((x) => x.label), values: r.statuses.map((x) => x.value), format: (v) => `${v} orders`, horizontal: true, color: SERIES[0] });
    }
    const stat = (label, value, delta) => `<div class="card stat span-3"><div class="stat-label">${label}</div><div class="stat-value sm">${value}</div>${delta}</div>`;

    function exportCSV() {
      if (!data) return;
      const r = compute();
      const lbl = `${isoDate(data.range[0])}_to_${isoDate(data.range[1])}`;
      const rows = [
        [`${live.settings.name} — Sales report`, `${fmtDate(data.range[0])} – ${fmtDate(data.range[1])}`],
        [],
        ['SUMMARY'],
        ['Net sales (RM)', r.cur.revenue],
        ['Paid orders', r.cur.paidOrders],
        ['Average order value (RM)', r.cur.avgOrder],
        ['Items sold', r.cur.items],
        ['Discounts (RM)', r.cur.discounts],
        ['Service charge (RM)', r.cur.service],
        [`${live.settings.taxLabel} (RM)`, r.cur.tax],
        ['Cancelled orders', r.cur.cancelled],
        [],
        ['SALES BY PERIOD', 'Sales (RM)', 'Orders'],
        ...r.series.labels.map((l, i) => [l, r.series.values[i], r.series.counts[i]]),
        [],
        ['PRODUCT PERFORMANCE', 'Qty', 'Revenue (RM)'],
        ...r.products.map((p) => [p.name, p.qty, p.revenue]),
        [],
        ['PAYMENT BREAKDOWN', 'Amount (RM)'],
        ...r.payments.map((p) => [p.label, p.value]),
        [],
        ['ORDER BREAKDOWN', 'Orders'],
        ...r.types.map((t) => [t.label, t.value]),
        ...r.statuses.map((t) => [t.label, t.value]),
        [],
        ['CASHIER PERFORMANCE', 'Orders', 'Sales (RM)'],
        ...r.cashiers.map((c) => [c.name, c.orders, c.revenue]),
        [],
        ['ORDERS', 'Date', 'Type', 'Customer', 'Total', 'Payment', 'Status'],
        ...r.cur.list.map((o) => [o.orderNo, fmtDateTime(o.createdAt), o.type, o.customer?.name || '', o.total, o.paymentStatus, o.status]),
      ];
      downloadFile(`report_${lbl}.csv`, toCSV(rows), 'text/csv');
      toast('CSV report downloaded.', 'success');
    }

    function exportPDF() {
      if (!data) return;
      const r = compute();
      const s = live.settings;
      const w = window.open('', '_blank');
      if (!w) return toast('Allow pop-ups to export PDF.', 'warning');
      const tbl = (head, rows) => `<table><thead><tr>${head.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((rw) => `<tr>${rw.map((c, i) => `<td class="${i ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const max = Math.max(1, ...r.series.values);
      const bars = r.series.values.map((v, i) => `<div class="b"><span style="height:${(v / max) * 100}%"></span><em>${esc(r.series.labels[i])}</em></div>`).join('');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.name)} report ${isoDate(data.range[0])}</title><style>
        body{font-family:Inter,system-ui,sans-serif;color:#1c1f33;margin:0;padding:28px;font-size:12px}
        h1{font-size:22px;margin:0}h2{font-size:14px;margin:22px 0 8px;color:#142a9c}.sub{color:#6b7088;margin-top:4px}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.kpi{border:1px solid #e5e7f0;border-radius:10px;padding:10px}.kpi b{display:block;font-size:17px;margin-top:4px}
        table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #e5e7f0;text-align:left}th{font-size:10px;text-transform:uppercase;color:#6b7088}.n{text-align:right}
        .chart{display:flex;align-items:flex-end;gap:3px;height:120px;border-bottom:1px solid #ccc;padding-bottom:16px}.b{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;position:relative}
        .b span{background:#2a44c9;border-radius:3px 3px 0 0;display:block}.b em{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-style:normal;font-size:8px;color:#6b7088;white-space:nowrap;overflow:hidden}
        .cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}.foot{margin-top:28px;color:#9aa0b6;font-size:10px}
        @page{size:A4;margin:12mm}</style></head><body>
        <h1>${esc(s.name)} — Sales Report</h1><div class="sub">${esc(fmtDate(data.range[0]))} – ${esc(fmtDate(data.range[1]))} · Generated ${esc(fmtDateTime(Date.now()))} by ${esc(ctx.user.name)}${$('[data-nodemo]').checked ? '' : ' · includes demo data'}</div>
        <div class="kpis"><div class="kpi">Net sales<b>${money(r.cur.revenue)}</b></div><div class="kpi">Paid orders<b>${r.cur.paidOrders}</b></div><div class="kpi">Avg order<b>${money(r.cur.avgOrder)}</b></div><div class="kpi">Items sold<b>${r.cur.items}</b></div></div>
        <h2>Sales trend</h2><div class="chart">${bars}</div>
        <div class="cols"><div><h2>Payment breakdown</h2>${tbl(['Method', 'Amount'], r.payments.map((p) => [p.label, money(p.value)]))}</div>
        <div><h2>Order breakdown</h2>${tbl(['Type', 'Orders'], [...r.types.map((t) => [t.label, t.value]), ...r.statuses.map((t) => [t.label, t.value])])}</div></div>
        <h2>Product performance</h2>${tbl(['Product', 'Qty', 'Revenue'], r.products.map((p) => [p.name, p.qty, money(p.revenue)]))}
        <h2>Cashier performance</h2>${tbl(['Staff / channel', 'Orders', 'Sales'], r.cashiers.map((c) => [c.name, c.orders, money(c.revenue)]))}
        <h2>Totals</h2>${tbl(['Item', 'Amount'], [['Discounts', money(r.cur.discounts)], ['Service charge', money(r.cur.service)], [s.taxLabel, money(r.cur.tax)], ['Cancelled orders', r.cur.cancelled]])}
        <div class="foot">TAPJERR.io · Smart Ordering. Seamless Business.</div>
        <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
      w.document.close();
    }

    root.querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => {
        period = b.dataset.p;
        load();
      })
    );
    root.querySelectorAll('[data-from],[data-to]').forEach((i) =>
      i.addEventListener('change', () => {
        custom = { from: $('[data-from]').value, to: $('[data-to]').value };
        if (custom.from > custom.to) custom = { from: custom.to, to: custom.from };
        load();
      })
    );
    $('[data-nodemo]').addEventListener('change', () => data && render());
    $('[data-csv]').onclick = exportCSV;
    $('[data-pdf]').onclick = exportPDF;
    load();
    // refresh when live orders change (debounced by data reload only for current-period reports)
    let t;
    const unsub = live.on('orders', () => {
      clearTimeout(t);
      t = setTimeout(() => data && data.range[1] >= Date.now() - 86400000 && load(), 1500);
    });
    return () => {
      unsub();
      clearTimeout(t);
    };
  },
};
