// TAPJERR.io — Overview dashboard
import { icon } from '../../core/icons.js';
import { esc, money, longDate, rangeOf, timeAgo, startOfMonth, endOfDay, startOfDay, addDays } from '../../core/utils.js';
import { animateCounters, promptDialog, toast, openModal, emptyState } from '../../core/ui.js';
import { lineChart, donutChart, barChart, SERIES } from '../../core/charts.js';
import { store } from '../../core/store.js';
import { productImage } from '../../core/seed.js';
import { storeOpenNow, orderTypeLabel } from '../../core/orders.js';
import { ROLES } from '../../core/permissions.js';
import { rangeControl, bindRange, openOrderDetail, lowStock } from '../common.js';
import { summarize, previousRange, deltaPct, salesSeries, topProducts, byPayment, byType, dailySeries } from '../analytics.js';
import { SUGGESTIONS, openAssistant } from '../assistant.js';
import { generateDemoOrders } from '../demo.js';

const fmtRM = (v) => money(v);
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default {
  render(root, ctx) {
    const { live } = ctx;
    let rangeState = { name: 'today', range: rangeOf('today') };
    let trend = 'week';
    const mgmt = ctx.role === 'super_admin' || ctx.role === 'admin';

    root.innerHTML = `
    <div class="overview">
      <div class="ov-main">
        <div class="store-title row between wrap"><div><h1>${greeting()}, ${esc(ctx.user.name.split(' ')[0])} 👋</h1>
          <p>Here's what's happening at <b data-store-name>${esc(live.settings.name)}</b> today.</p></div>
          <span class="plan-pill">${esc(ROLES[ctx.role].label)} · ${store.mode === 'demo' ? 'Demo Mode' : 'Cloud'}</span></div>
        <div data-demo-banner></div>
        <div class="ov-head">
          <div><h2 style="display:inline">Overview</h2><span class="date" data-date></span></div>
          ${rangeControl('today')}
        </div>
        <div class="stat-grid">
          <a class="card hover stat span-5" href="#/reports">
            <div class="stat-label">Sales <span class="stat-link">${icon('chevron-right', 22)}</span></div>
            <div class="stat-value" data-count="0" data-fmt="rm" data-k="revenue">RM 0.00</div>
            <span class="delta" data-delta="revenue">0.00%</span>
            <div class="stat-meta mt"><span data-k="orders-txt">0 order</span><br><span data-k="avg-txt">Avg RM 0.00/ order</span></div>
          </a>
          <div class="card hover stat span-4">
            <div class="stat-label">Items Sold</div>
            <div class="row"><div class="stat-value" data-count="0" data-k="items">0</div><span class="delta" data-delta="items">0.00%</span></div>
            <div class="stat-meta mt"><span data-k="avgitem-txt">Avg RM 0.00/ item</span><br><span data-k="avgitems-txt">Avg 0 items/ order</span></div>
          </div>
          <div class="card hover stat span-3 center" data-target-card>
            <div class="target-ring" data-ring></div>
            <button class="btn btn-soft btn-block" data-set-target>${icon('target', 18)} Set Sales Target</button>
          </div>
        </div>

        <div class="mini-stats mt">
          ${mini('clipboard-list', 'tone-blue', 'Total Orders', 'k-orders')}
          ${mini('hourglass', 'tone-amber', 'Pending', 'k-pending', '#/orders?tab=pending')}
          ${mini('check-check', 'tone-green', 'Completed', 'k-completed')}
          ${mini('circle-x', 'tone-red', 'Cancelled', 'k-cancelled')}
          ${mini('receipt', 'tone-indigo', 'Avg Order Value', 'k-aov', '', 'rm')}
          ${mini('calendar-days', 'tone-blue', 'Monthly Revenue', 'k-month', '', 'rm')}
        </div>

        <div class="stat-grid mt">
          <div class="card span-8">
            <div class="card-head"><h3>Sales Overview</h3><span class="small muted" data-series-unit></span></div>
            <div data-chart-sales></div>
          </div>
          <div class="card span-4">
            <div class="card-head"><h3>Sales by Payment</h3><a href="#/reports" class="stat-link">${icon('chevron-right', 22)}</a></div>
            <div data-chart-pay></div>
          </div>
          <div class="card span-6">
            <div class="card-head"><h3>Top Selling Items</h3><a href="#/reports" class="small">View report</a></div>
            <div data-top></div>
          </div>
          <div class="card span-6">
            <div class="card-head"><h3>Orders by Order Type</h3></div>
            <div data-chart-type></div>
          </div>
          <div class="card span-12">
            <div class="card-head"><h3>Weekly &amp; Monthly Sales</h3>
              <div class="seg" data-trend><button data-t="week" class="active">Last 7 days</button><button data-t="month">Last 30 days</button><button data-t="year">This year</button></div></div>
            <div data-chart-trend></div>
          </div>
        </div>

        <div class="quick-tiles mt">
          ${tile('#/pos', 'calculator', 'Open POS Cashier', 'Take walk-in orders & payments')}
          ${tile(mgmt ? '#/qr' : '#/tables', 'qr-code', mgmt ? 'Table QR Codes' : 'Tables', mgmt ? 'Print QR for each table' : 'Seating & bills')}
          ${tile('#/kitchen', 'chef-hat', 'Kitchen Display', 'Live order preparation')}
          ${tile(mgmt ? '#/reports' : '#/customers', mgmt ? 'chart-column' : 'users', mgmt ? 'Reports & Export' : 'Customers', mgmt ? 'PDF & CSV analytics' : 'History & spending')}
        </div>
      </div>

      <aside class="side-panel">
        <div>
          <div class="row between mb"><h3 style="font-size:20px">Notifications</h3><a href="#/orders" class="bold" data-notif-count>Show More</a></div>
          <div class="notif-list" data-notifs></div>
        </div>
        <div class="promo-card">
          <span class="promo-art">${icon('rocket', 120)}</span>
          <h3>Quick Setup to Start Selling</h3>
          <p data-setup-progress>Complete your store profile, payments and table QR codes.</p>
          <button class="btn btn-light" data-setup>Start Now ${icon('arrow-right', 18)}</button>
        </div>
        <div class="assistant">
          <h3><span class="spark">${icon('sparkles', 22)}</span> Ask anything about your business</h3>
          ${SUGGESTIONS.map((q) => `<button class="ask" data-ask="${esc(q)}">${esc(q)} ${icon('chevron-right', 20)}</button>`).join('')}
          <button class="btn btn-soft btn-block btn-lg" data-chat>${icon('message-circle', 20)} Chat with Insights Assistant</button>
        </div>
      </aside>
    </div>`;

    function mini(ic, tone, label, key, href = '', fmt = '') {
      const tag = href ? 'a' : 'div';
      return `<${tag} class="card hover mini" ${href ? `href="${href}"` : ''}><span class="mini-icon ${tone}">${icon(ic, 20)}</span><div><b data-count="0" data-k="${key}" ${fmt ? `data-fmt="${fmt}"` : ''}>0</b><span>${label}</span></div></${tag}>`;
    }
    function tile(href, ic, title, sub) {
      return `<a class="card hover quick-tile" href="${href}"><div class="row between"><span class="qt-icon">${icon(ic, 28)}</span>${icon('chevron-right', 22)}</div><div><h4>${esc(title)}</h4><p class="small muted">${esc(sub)}</p></div></a>`;
    }

    const $ = (s) => root.querySelector(s);
    const setText = (k, v) => {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (el) el.textContent = v;
    };
    const setCount = (k, v) => {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (el) el.dataset.count = v;
    };
    const setDelta = (k, d) => {
      const el = root.querySelector(`[data-delta="${k}"]`);
      el.className = `delta ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}`;
      el.innerHTML = `${d > 0.05 ? icon('trending-up', 14) : d < -0.05 ? icon('trending-down', 14) : ''}${Math.abs(d).toFixed(2)}%`;
      el.title = 'Compared with the previous period of the same length';
    };

    function renderStats() {
      const s = live.settings;
      const r = rangeState.range;
      const cur = summarize(live.orders, r);
      const prev = summarize(live.orders, previousRange(r));
      const open = storeOpenNow(s);
      $('[data-date]').textContent = `${longDate()} (Store ${open ? 'Open' : 'Closed'})`;
      setCount('revenue', cur.revenue);
      setDelta('revenue', deltaPct(cur.revenue, prev.revenue));
      setText('orders-txt', `${cur.paidOrders} paid order${cur.paidOrders === 1 ? '' : 's'}`);
      setText('avg-txt', `Avg ${money(cur.avgOrder)}/ order`);
      setCount('items', cur.items);
      setDelta('items', deltaPct(cur.items, prev.items));
      setText('avgitem-txt', `Avg ${money(cur.avgItemPrice)}/ item`);
      setText('avgitems-txt', `Avg ${cur.avgItems} items/ order`);
      setCount('k-orders', cur.orders);
      setCount('k-pending', cur.pending);
      setCount('k-completed', cur.completed);
      setCount('k-cancelled', cur.cancelled);
      setCount('k-aov', cur.avgOrder);
      const month = summarize(live.orders, [startOfMonth().getTime(), endOfDay().getTime()]);
      setCount('k-month', month.revenue);
      animateCounters(root, { rm: fmtRM });

      // Target ring (daily target scaled to the number of days in range)
      const days = Math.max(1, Math.round((r[1] - r[0]) / 86400000));
      const target = (s.dailyTarget || 0) * days;
      const pctv = target ? Math.min(1, cur.revenue / target) : 0;
      const C = 2 * Math.PI * 58;
      $('[data-ring]').innerHTML = `<svg viewBox="0 0 140 140" width="140" height="140"><circle cx="70" cy="70" r="58" fill="none" stroke="var(--track)" stroke-width="14"/>
        <circle class="val" cx="70" cy="70" r="58" fill="none" stroke="${pctv >= 1 ? 'var(--green)' : 'var(--primary)'}" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pctv)}" transform="rotate(-90 70 70)"/></svg>
        <div class="center"><div>${target ? `<b style="font-size:22px">${Math.round(pctv * 100)}%</b><div class="tiny muted">of ${money(target)}</div>` : `<span class="muted">${icon('target', 34)}</span>`}</div></div>`;

      // Charts
      const ser = salesSeries(live.orders, r);
      $('[data-series-unit]').textContent = ser.unit === 'hour' ? 'Hourly' : ser.unit === 'day' ? 'Daily' : 'Monthly';
      lineChart($('[data-chart-sales]'), { labels: ser.labels, series: [{ name: 'Sales', values: ser.values, color: SERIES[0] }], format: fmtRM, height: 250 });

      const pay = byPayment(cur.sales, s);
      donutChart($('[data-chart-pay]'), {
        segments: pay.length ? pay.map((p, i) => ({ label: p.label, value: p.value, color: SERIES[i % SERIES.length] })) : s.paymentMethods.filter((m) => m.enabled).map((m, i) => ({ label: m.name, value: 0, color: SERIES[i % SERIES.length] })),
        format: fmtRM,
        center: money(cur.revenue),
        centerLabel: 'paid sales',
        size: 140,
      });
      const types = byType(cur.list);
      donutChart($('[data-chart-type]'), { segments: types.map((t, i) => ({ ...t, color: SERIES[i] })), format: (v) => `${v}`, center: String(cur.orders), centerLabel: 'orders', size: 140 });

      const top = topProducts(cur.sales, 5);
      const pMap = new Map(live.products.map((p) => [p.id, p]));
      $('[data-top]').innerHTML = top.length
        ? `<div class="top-items">${top
            .map((t, i) => {
              const p = pMap.get(t.id) || { name: t.name };
              return `<div class="top-item"><span class="rank">#${i + 1}</span><img src="${esc(productImage(p))}" alt=""><div class="grow"><b>${esc(t.name)}</b><div class="tiny muted">${t.qty} sold</div></div><b class="tnum">${money(t.revenue)}</b></div>`;
            })
            .join('')}</div>`
        : emptyState({ iconName: 'chart-no-axes-column', title: 'No Sales Yet', text: "Check out the best-selling items as soon as sales begin." });
      renderTrend();
    }

    function renderTrend() {
      let ser;
      if (trend === 'week') ser = dailySeries(live.orders, startOfDay(addDays(new Date(), -6)), 7);
      else if (trend === 'month') ser = dailySeries(live.orders, startOfDay(addDays(new Date(), -29)), 30);
      else ser = salesSeries(live.orders, [new Date(new Date().getFullYear(), 0, 1).getTime(), Date.now() + 1]);
      barChart($('[data-chart-trend]'), { labels: ser.labels, values: ser.values, format: fmtRM, height: 230 });
    }

    function renderNotifs() {
      const items = [];
      const s = live.settings;
      live.orders
        .filter((o) => o.status === 'new')
        .slice(0, 5)
        .forEach((o) => items.push({ ic: 'bell-ring', tone: 'tone-blue', title: `New order ${o.orderNo}`, sub: `${orderTypeLabel(o)} · ${timeAgo(o.createdAt)}`, order: o.id }));
      live.orders
        .filter((o) => o.paymentStatus === 'pending_verification')
        .slice(0, 4)
        .forEach((o) => items.push({ ic: 'badge-alert', tone: 'tone-amber', title: `Verify payment ${o.orderNo}`, sub: `${money(o.total)} · ref ${o.paymentRef || '—'}`, order: o.id }));
      live.orders
        .filter((o) => o.status === 'ready')
        .slice(0, 3)
        .forEach((o) => items.push({ ic: 'bell', tone: 'tone-green', title: `Ready: ${o.orderNo}`, sub: `${orderTypeLabel(o)}${o.customer?.name ? ' · ' + o.customer.name : ''}`, order: o.id }));
      lowStock(live.inventory)
        .slice(0, 3)
        .forEach((i) => items.push({ ic: 'package', tone: 'tone-red', title: `Low stock: ${i.name}`, sub: `${i.stock} ${i.unit} left`, href: '#/inventory' }));
      if (!storeOpenNow(s)) items.push({ ic: 'store', tone: 'tone-gray', title: 'Store is closed', sub: 'Customers cannot place orders. Change in Settings.', href: '#/settings' });
      $('[data-notif-count]').textContent = `Show More (${items.length})`;
      $('[data-notifs]').innerHTML = items.length
        ? items
            .slice(0, 5)
            .map((n, i) => `<button class="notif fade-in" data-n="${i}"><span class="mini-icon ${n.tone}">${icon(n.ic, 18)}</span><div class="grow"><strong>${esc(n.title)}</strong><span>${esc(n.sub)}</span></div></button>`)
            .join('')
        : `<div class="notif"><span class="mini-icon tone-green">${icon('circle-check', 18)}</span><div><strong>You're all caught up</strong><span>New orders, payments and stock alerts appear here.</span></div></div>`;
      root.querySelectorAll('[data-n]').forEach((b) =>
        b.addEventListener('click', () => {
          const n = items[Number(b.dataset.n)];
          if (n.order) openOrderDetail(n.order, ctx);
          else if (n.href) location.hash = n.href;
        })
      );
    }

    function renderDemoBanner() {
      const hasDemo = live.orders.some((o) => o.demo);
      const box = $('[data-demo-banner]');
      if (hasDemo) {
        box.innerHTML = `<div class="demo-banner mt">${icon('flask-conical', 16)} <span class="grow">Showing <b>demo sales data</b> for illustration. Remove it in Settings → Data before going live.</span></div>`;
      } else if (!live.orders.length && ctx.can('loadDemoData')) {
        box.innerHTML = `<div class="demo-banner mt">${icon('info', 16)} <span class="grow">No orders yet. Want to preview the dashboard with clearly-labelled demo sales?</span><button class="btn btn-sm btn-outline" data-load-demo>Load demo data</button></div>`;
        box.querySelector('[data-load-demo]').onclick = async (e) => {
          e.target.disabled = true;
          try {
            const n = await generateDemoOrders(live);
            toast(`${n} demo orders generated (labelled “Demo data”).`, 'success');
          } catch (err) {
            toast(err.message, 'error');
            e.target.disabled = false;
          }
        };
      } else box.innerHTML = '';
    }

    function setupChecklist() {
      const s = live.settings;
      const steps = [
        { done: !!(s.phone && s.address), label: 'Store profile (address & phone)', href: '#/settings?tab=store' },
        { done: !!s.logo, label: 'Upload your logo', href: '#/settings?tab=store' },
        { done: s.paymentMethods.some((m) => m.type === 'qr' && m.enabled && m.qrImage) || s.paymentMethods.some((m) => m.type === 'transfer' && m.enabled && m.accountNo), label: 'Payment details (DuitNow QR / bank)', href: '#/settings?tab=payments' },
        { done: live.products.some((p) => p.image), label: 'Add product photos', href: '#/products' },
        { done: live.tables.length > 0, label: 'Set up tables & print QR codes', href: '#/qr' },
        { done: live.staff.length > 1, label: 'Invite your staff', href: '#/staff' },
      ];
      return steps;
    }
    function renderSetup() {
      const steps = setupChecklist();
      const done = steps.filter((x) => x.done).length;
      $('[data-setup-progress]').textContent = `${done} of ${steps.length} steps done. Complete your store profile, payments and table QR codes.`;
    }

    // Events
    bindRange(root, (st) => {
      rangeState = st;
      renderStats();
    });
    root.querySelectorAll('[data-t]').forEach((b) =>
      b.addEventListener('click', () => {
        trend = b.dataset.t;
        root.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
        renderTrend();
      })
    );
    $('[data-set-target]').addEventListener('click', async () => {
      if (!(ctx.role === 'super_admin' || ctx.role === 'admin')) return toast('Only Admins can change the sales target.', 'warning');
      const v = await promptDialog({ title: 'Daily sales target', label: 'Target per day (RM)', value: live.settings.dailyTarget || '', type: 'number', confirmText: 'Save target' });
      if (v == null) return;
      const n = Number(v);
      if (!(n >= 0)) return toast('Enter a valid amount.', 'error');
      await store.set('settings', 'store', { dailyTarget: n }, { merge: true });
      toast(`Daily target set to ${money(n)}.`, 'success');
    });
    $('[data-setup]').addEventListener('click', () => {
      const steps = setupChecklist();
      const { el, close } = openModal({
        title: 'Quick Setup',
        size: 'sm',
        body: `<p class="muted small mb">Finish these steps to start selling with ${esc(live.settings.name)}.</p>
          <div class="col">${steps
            .map((x) => `<a class="notif" href="${x.href}"><span class="mini-icon ${x.done ? 'tone-green' : 'tone-gray'}">${icon(x.done ? 'circle-check' : 'circle', 18)}</span><div class="grow"><strong>${esc(x.label)}</strong><span>${x.done ? 'Done' : 'Tap to set up'}</span></div>${icon('chevron-right', 18)}</a>`)
            .join('')}</div>`,
      });
      el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close()));
    });
    root.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => openAssistant(live, b.dataset.ask)));
    $('[data-chat]').addEventListener('click', () => openAssistant(live));

    const unsubs = [
      live.on(['orders', 'settings'], () => {
        renderStats();
        renderNotifs();
        renderDemoBanner();
      }),
      live.on(['inventory'], renderNotifs),
      live.on(['settings', 'products', 'tables', 'staff'], renderSetup),
    ];
    const clock = setInterval(renderNotifs, 60000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(clock);
    };
  },
};
