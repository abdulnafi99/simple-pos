// TAPJERR.io — analytics helpers shared by Overview and Reports.
import { round2, startOfDay, addDays, pad, fmtDate, sum } from '../core/utils.js';
import { paymentMethodName } from '../core/orders.js';

export const isSale = (o) => o.status !== 'cancelled' && o.paymentStatus === 'paid';
export const inRange = (o, [a, b]) => o.createdAt >= a && o.createdAt <= b;

export function summarize(orders, range) {
  const list = orders.filter((o) => inRange(o, range));
  const sales = list.filter(isSale);
  const revenue = round2(sum(sales, (o) => o.total));
  const items = sum(sales, (o) => o.items.reduce((a, i) => a + i.qty, 0));
  const valid = list.filter((o) => o.status !== 'cancelled');
  return {
    list,
    sales,
    revenue,
    orders: valid.length,
    paidOrders: sales.length,
    items,
    avgOrder: sales.length ? round2(revenue / sales.length) : 0,
    avgItemPrice: items ? round2(revenue / items) : 0,
    avgItems: sales.length ? Math.round((items / sales.length) * 10) / 10 : 0,
    pending: list.filter((o) => ['new', 'confirmed', 'preparing', 'ready'].includes(o.status)).length,
    completed: list.filter((o) => o.status === 'completed').length,
    cancelled: list.filter((o) => o.status === 'cancelled').length,
    discounts: round2(sum(sales, (o) => o.discount?.amount || 0)),
    tax: round2(sum(sales, (o) => o.tax || 0)),
    service: round2(sum(sales, (o) => o.serviceCharge || 0)),
  };
}

export function previousRange([a, b]) {
  const len = b - a + 1;
  return [a - len, a - 1];
}

export function deltaPct(cur, prev) {
  if (!prev) return cur ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

/** Time series buckets: hourly for ≤ 1 day, otherwise daily (or monthly for long ranges). */
export function salesSeries(orders, [a, b]) {
  const days = Math.round((b - a) / 86400000);
  const sales = orders.filter((o) => isSale(o) && inRange(o, [a, b]));
  if (days <= 1) {
    const labels = [];
    const values = [];
    const counts = [];
    for (let h = 7; h <= 23; h++) {
      labels.push(`${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`);
      const hs = sales.filter((o) => new Date(o.createdAt).getHours() === h);
      values.push(round2(sum(hs, (o) => o.total)));
      counts.push(hs.length);
    }
    return { labels, values, counts, unit: 'hour' };
  }
  if (days > 92) {
    const map = new Map();
    const start = new Date(a);
    const end = new Date(b);
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) map.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, { v: 0, c: 0, label: d.toLocaleDateString('en-MY', { month: 'short', year: '2-digit' }) });
    sales.forEach((o) => {
      const d = new Date(o.createdAt);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      if (map.has(k)) {
        map.get(k).v += o.total;
        map.get(k).c += 1;
      }
    });
    const vals = [...map.values()];
    return { labels: vals.map((x) => x.label), values: vals.map((x) => round2(x.v)), counts: vals.map((x) => x.c), unit: 'month' };
  }
  return dailySeries(sales, startOfDay(a), Math.max(1, Math.ceil((b - startOfDay(a).getTime()) / 86400000)));
}

export function dailySeries(orders, start, nDays) {
  const labels = [];
  const values = [];
  const counts = [];
  for (let i = 0; i < nDays; i++) {
    const d0 = addDays(start, i).getTime();
    const d1 = addDays(start, i + 1).getTime() - 1;
    const ds = orders.filter((o) => isSale(o) && o.createdAt >= d0 && o.createdAt <= d1);
    labels.push(nDays <= 7 ? new Date(d0).toLocaleDateString('en-MY', { weekday: 'short' }) : fmtDate(d0, { day: 'numeric', month: 'short' }));
    values.push(round2(sum(ds, (o) => o.total)));
    counts.push(ds.length);
  }
  return { labels, values, counts, unit: 'day' };
}

export function topProducts(sales, limit = 5) {
  const map = new Map();
  for (const o of sales) {
    for (const i of o.items) {
      const k = i.productId || i.name;
      const x = map.get(k) || { id: k, name: i.name, qty: 0, revenue: 0 };
      x.qty += i.qty;
      x.revenue = round2(x.revenue + i.price * i.qty);
      map.set(k, x);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit);
}

export function byPayment(sales, settings) {
  const map = new Map();
  for (const o of sales) {
    const k = o.paymentMethod || 'other';
    map.set(k, round2((map.get(k) || 0) + o.total));
  }
  return [...map.entries()].map(([id, value]) => ({ id, label: paymentMethodName(settings, id), value })).sort((a, b) => b.value - a.value);
}

export function byType(list) {
  const valid = list.filter((o) => o.status !== 'cancelled');
  const seg = [
    { label: 'Dine-in (POS)', value: valid.filter((o) => o.type === 'dine-in' && o.source !== 'qr').length },
    { label: 'Table QR', value: valid.filter((o) => o.source === 'qr').length },
    { label: 'Takeaway (walk-in)', value: valid.filter((o) => o.type === 'takeaway' && o.source === 'pos').length },
    { label: 'Online takeaway', value: valid.filter((o) => o.source === 'online').length },
  ];
  return seg;
}

export function byCashier(sales) {
  const map = new Map();
  for (const o of sales) {
    const k = o.cashierName || (o.source === 'pos' ? 'Unknown' : 'Self-order (customer)');
    const x = map.get(k) || { name: k, orders: 0, revenue: 0 };
    x.orders += 1;
    x.revenue = round2(x.revenue + o.total);
    map.set(k, x);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
