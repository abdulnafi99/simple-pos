// TAPJERR.io — Business Insights Assistant.
// Answers questions from the store's own live data, entirely in the browser.
// (No third-party AI service is called, so no API keys are exposed in frontend code.)
import { icon } from '../core/icons.js';
import { esc, money, rangeOf, round2, uid } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { summarize, topProducts, deltaPct, salesSeries, isSale } from './analytics.js';

export const SUGGESTIONS = ['Give me ideas to increase revenue', "Which products aren't selling?", 'Create a promotion for this weekend', "How's my business doing today?"];

function analyse(live) {
  const today = rangeOf('today');
  const yest = rangeOf('yesterday');
  const last14 = [Date.now() - 14 * 86400000, Date.now()];
  const t = summarize(live.orders, today);
  const y = summarize(live.orders, yest);
  const r14 = summarize(live.orders, last14);
  const top14 = topProducts(r14.sales, 100);
  const products = live.products.filter((p) => p.enabled !== false);
  return { t, y, r14, top14, products, settings: live.settings };
}

export function answer(q, live) {
  const s = q.toLowerCase();
  const a = analyse(live);
  if (/today|doing|how.*business|performance/.test(s)) return today(a, live);
  if (/not selling|aren.?t selling|slow|worst|least/.test(s)) return slowMovers(a);
  if (/promo|promotion|weekend|discount|campaign/.test(s)) return promotion(a);
  if (/revenue|increase|grow|ideas|improve|more sales/.test(s)) return ideas(a, live);
  if (/best|top|popular/.test(s)) return bestSellers(a);
  if (/stock|inventory|low/.test(s)) return stock(live);
  if (/pending|queue|kitchen|waiting/.test(s)) return pending(live);
  return {
    html: `<p>I can analyse your live store data. Try asking about:</p><ul>
      <li>Today's performance or sales vs yesterday</li><li>Best sellers or products that aren't selling</li>
      <li>Revenue ideas or a weekend promotion</li><li>Low stock or pending orders</li></ul>`,
  };
}

function today(a, live) {
  const { t, y, settings } = a;
  const d = deltaPct(t.revenue, y.revenue);
  const target = settings.dailyTarget || 0;
  const series = salesSeries(live.orders, rangeOf('today'));
  const peakIdx = series.values.indexOf(Math.max(...series.values));
  const peak = series.values[peakIdx] > 0 ? series.labels[peakIdx] : null;
  if (!t.orders) {
    return { html: `<p>No orders yet today. ${y.revenue ? `Yesterday you made <b>${money(y.revenue)}</b> from ${y.paidOrders} paid orders.` : ''}</p><p>Tip: make sure table QR codes are placed on every table and the store status is set to open in Settings.</p>` };
  }
  return {
    html: `<p>Today so far: <b>${money(t.revenue)}</b> from <b>${t.paidOrders}</b> paid orders (${t.items} items), average <b>${money(t.avgOrder)}</b> per order.</p>
      <ul>
        <li>${d >= 0 ? '📈' : '📉'} ${Math.abs(d).toFixed(0)}% ${d >= 0 ? 'up' : 'down'} vs yesterday (${money(y.revenue)}).</li>
        ${target ? `<li>🎯 ${Math.min(100, Math.round((t.revenue / target) * 100))}% of your ${money(target)} daily target${t.revenue < target ? ` — ${money(target - t.revenue)} to go` : ' — target reached!'}.</li>` : ''}
        ${peak ? `<li>⏰ Busiest hour: <b>${peak}</b>.</li>` : ''}
        ${t.pending ? `<li>🧾 ${t.pending} order(s) still in progress.</li>` : ''}
        ${t.cancelled ? `<li>⚠️ ${t.cancelled} cancelled order(s) today — worth checking why.</li>` : ''}
      </ul>`,
  };
}

function slowMovers(a) {
  const sold = new Map(a.top14.map((x) => [x.id, x.qty]));
  const ranked = a.products.map((p) => ({ p, qty: sold.get(p.id) || 0 })).sort((x, y) => x.qty - y.qty);
  const zero = ranked.filter((x) => x.qty === 0);
  const slow = ranked.slice(0, 4);
  if (!a.r14.sales.length) return { html: `<p>There are no paid sales in the last 14 days yet, so every item is currently at zero. Once orders come in I'll rank your slow movers.</p>` };
  return {
    html: `<p>Based on the last 14 days of paid orders:</p><ul>
      ${(zero.length ? zero : slow).map((x) => `<li><b>${esc(x.p.name)}</b> — ${x.qty} sold${x.p.soldOut ? ' (currently marked sold out)' : ''}</li>`).join('')}</ul>
      <p>Ideas: feature ${esc((zero[0] || slow[0]).p.name)} on the customer menu, pair it with a best seller as a bundle, or offer a tasting size. If it still doesn't move, consider removing it to simplify the menu.</p>`,
  };
}

function bestSellers(a) {
  if (!a.top14.length) return { html: '<p>No paid sales in the last 14 days yet.</p>' };
  return { html: `<p>Top sellers (last 14 days):</p><ol>${a.top14.slice(0, 5).map((x) => `<li><b>${esc(x.name)}</b> — ${x.qty} sold · ${money(x.revenue)}</li>`).join('')}</ol>` };
}

function ideas(a, live) {
  const { r14 } = a;
  const tips = [];
  const withPastry = r14.sales.filter((o) => o.items.some((i) => /donut|pastry|cake|croissant/i.test(i.name))).length;
  const attach = r14.paidOrders ? Math.round((withPastry / r14.paidOrders) * 100) : 0;
  const addons = r14.sales.flatMap((o) => o.items).filter((i) => (i.options || []).some((x) => x.price > 0)).length;
  const lines = r14.sales.flatMap((o) => o.items).length;
  const upsell = lines ? Math.round((addons / lines) * 100) : 0;
  const qrShare = r14.orders ? Math.round((r14.list.filter((o) => o.source !== 'pos').length / r14.orders) * 100) : 0;
  if (r14.paidOrders) tips.push(`Your average order is <b>${money(r14.avgOrder)}</b>. A drink + donut combo priced slightly under the separate total can lift this — only ${attach}% of orders include a pastry.`);
  else tips.push('Start with a drink + donut combo priced slightly under the separate total to lift average order value.');
  tips.push(`Train staff to suggest upgrades (Large size, Oat milk, Extra shot). ${lines ? `Only ${upsell}% of drinks currently include a paid add-on.` : ''}`);
  tips.push(`Promote table QR & online takeaway${r14.orders ? ` — currently ${qrShare}% of orders are self-ordered` : ''}. Self-ordering shortens queues at peak hours.`);
  if (a.top14[0]) tips.push(`Lean into your hero product <b>${esc(a.top14[0].name)}</b>: feature it on the customer home banner and create a seasonal variation.`);
  tips.push('Set a daily sales target and review the Reports page weekly to spot slow days for happy-hour offers.');
  return { html: `<p>Here are revenue ideas based on your data:</p><ul>${tips.map((t) => `<li>${t}</li>`).join('')}</ul>` };
}

function promotion(a) {
  const sold = new Map(a.top14.map((x) => [x.id, x.qty]));
  const ranked = a.products.filter((p) => !p.soldOut).map((p) => ({ p, qty: sold.get(p.id) || 0 }));
  ranked.sort((x, y) => y.qty - x.qty);
  const hero = ranked[0]?.p;
  const slow = ranked[ranked.length - 1]?.p;
  const name = 'Weekend 15%';
  return {
    html: `<p>Suggested weekend promotion:</p>
      <ul><li><b>"Selagi Weekend"</b> — 15% off any 2 drinks, Saturday & Sunday.</li>
      ${hero && slow && hero.id !== slow.id ? `<li>Bundle: <b>${esc(hero.name)}</b> + <b>${esc(slow.name)}</b> at ${money(round2((hero.price + slow.price) * 0.85))} (save 15%).</li>` : ''}
      <li>Post it on Instagram on Friday evening and add a table tent next to each QR code.</li></ul>
      <p class="small muted">Add it as a discount preset so cashiers can apply it in one tap at the POS.</p>`,
    action: { label: `Add "${name}" discount preset`, run: async (live) => addPreset(live, { name, type: 'percent', value: 15 }) },
  };
}

async function addPreset(live, preset) {
  const presets = [...(live.settings.discountPresets || [])];
  if (presets.some((p) => p.name === preset.name)) return toast('That preset already exists.', 'info');
  presets.push({ id: uid(8), ...preset });
  await store.set('settings', 'store', { discountPresets: presets }, { merge: true });
  toast(`Discount preset "${preset.name}" added. Find it in POS → Discount.`, 'success');
}

function stock(live) {
  const low = live.inventory.filter((i) => i.stock <= i.lowAt);
  if (!live.inventory.length) return { html: '<p>Inventory is only visible to Admins.</p>' };
  if (!low.length) return { html: '<p>All inventory items are above their low-stock levels. 👍</p>' };
  return { html: `<p>${low.length} item(s) are low:</p><ul>${low.map((i) => `<li><b>${esc(i.name)}</b> — ${i.stock} ${esc(i.unit)} left (alert at ${i.lowAt})</li>`).join('')}</ul>` };
}

function pending(live) {
  const p = live.orders.filter((o) => ['new', 'confirmed', 'preparing'].includes(o.status));
  if (!p.length) return { html: '<p>No orders waiting right now. Kitchen is clear! ✅</p>' };
  return { html: `<p>${p.length} order(s) in progress:</p><ul>${p.slice(0, 8).map((o) => `<li><b>${esc(o.orderNo)}</b> — ${esc(o.status)}</li>`).join('')}</ul>` };
}

export function openAssistant(live, initial) {
  const { el } = openModal({
    title: 'Business Insights Assistant',
    size: 'md',
    body: `<p class="tiny muted mb">${icon('shield-check', 13)} Answers are computed from your live store data on this device.</p>
      <div class="chat-log" data-log></div>
      <div class="chips mt" data-sugg>${SUGGESTIONS.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`,
    footer: `<form class="row grow" data-form style="width:100%"><input class="input grow" name="q" placeholder="Ask about sales, products, stock…" autocomplete="off"><button class="btn btn-primary" type="submit">${icon('send', 18)}</button></form>`,
  });
  const log = el.querySelector('[data-log]');
  const ask = (q) => {
    if (!q) return;
    log.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(q)}</div>`);
    const res = answer(q, live);
    const id = 'a' + uid(6);
    log.insertAdjacentHTML('beforeend', `<div class="bubble bot ai-answer fade-in">${res.html}${res.action ? `<button class="btn btn-sm btn-soft mt" id="${id}">${icon('plus', 14)} ${esc(res.action.label)}</button>` : ''}</div>`);
    if (res.action) el.querySelector('#' + id).onclick = () => res.action.run(live);
    log.scrollTop = log.scrollHeight;
  };
  el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
  el.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.q;
    ask(inp.value.trim());
    inp.value = '';
  });
  if (initial) ask(initial);
  else log.innerHTML = `<div class="bubble bot">Hi! I'm your Selagi Coffee insights assistant. Ask me anything about your business.</div>`;
}

export { isSale };
