// TAPJERR.io — clearly-labelled DEMO sales data for showcasing the dashboard.
// Every generated order carries `demo: true`, shows a "Demo data" badge and can be
// removed in one click from Settings → Data. Never enabled automatically.
import { store } from '../core/store.js';
import { uid, dateKey, round2, startOfDay } from '../core/utils.js';
import { computeTotals, unitPrice } from '../core/orders.js';

const NAMES = ['Aiman', 'Siti', 'Wei Ling', 'Arjun', 'Nurul', 'Farah', 'Hafiz', 'Jia Hui', 'Kumar', 'Liyana', 'Daniel', 'Aisyah'];

export async function generateDemoOrders(live, days = 30) {
  const products = live.products.filter((p) => p.enabled !== false);
  if (!products.length) throw new Error('Add products before generating demo data.');
  const tables = live.tables;
  const settings = live.settings;
  const methods = settings.paymentMethods.filter((m) => m.enabled).map((m) => m.id);
  const ops = [];
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  for (let d = days - 1; d >= 0; d--) {
    const day = startOfDay(Date.now() - d * 86400000);
    const weekend = [0, 6].includes(day.getDay());
    const count = 14 + rand(10) + (weekend ? 10 : 0);
    let seq = 900;
    for (let k = 0; k < count; k++) {
      const hour = pick([8, 9, 10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 17, 18, 19, 20, 21]);
      const at = day.getTime() + hour * 3600000 + rand(60) * 60000;
      if (at > Date.now()) continue;
      const items = Array.from({ length: 1 + rand(3) }, () => {
        const p = pick(products);
        const options = (p.optionGroups || []).filter((g) => g.required).map((g) => ({ group: g.name, name: g.options[0].name, price: g.options[0].price }));
        return { productId: p.id, name: p.name, price: unitPrice(p, options), qty: 1 + (Math.random() < 0.2 ? 1 : 0), options, note: '' };
      });
      const r = Math.random();
      const source = r < 0.45 ? 'pos' : r < 0.75 ? 'qr' : 'online';
      const type = source === 'online' ? 'takeaway' : source === 'qr' ? 'dine-in' : Math.random() < 0.5 ? 'dine-in' : 'takeaway';
      const table = type === 'dine-in' ? pick(tables) : null;
      const cancelled = Math.random() < 0.04;
      const method = pick(methods);
      const t = computeTotals(items, settings, { type, cash: method === 'cash' });
      const phone = source !== 'pos' || Math.random() < 0.3 ? `01${rand(9) + 1}${String(1000000 + rand(8999999))}` : '';
      const status = d === 0 && at > Date.now() - 40 * 60000 ? pick(['new', 'preparing', 'ready']) : cancelled ? 'cancelled' : 'completed';
      const order = {
        id: 'demo_' + uid(14),
        orderNo: `TAP-${dateKey(at)}-${++seq}`,
        source,
        type,
        tableId: table?.id || '',
        tableNumber: table?.number || '',
        guests: type === 'dine-in' ? 1 + rand(4) : 0,
        customer: { name: phone ? pick(NAMES) : '', phone },
        items,
        subtotal: t.subtotal,
        discount: null,
        serviceCharge: t.service,
        tax: t.tax,
        rounding: t.rounding,
        total: t.total,
        paymentMethod: method,
        paymentStatus: cancelled ? 'unpaid' : status === 'completed' ? 'paid' : 'unpaid',
        paymentRef: '',
        pickupAt: type === 'takeaway' && source === 'online' ? at + 20 * 60000 : null,
        note: '',
        status,
        statusHistory: [{ status: 'new', at, by: 'Demo' }, ...(status !== 'new' ? [{ status, at: at + 12 * 60000, by: 'Demo' }] : [])],
        cashierId: '',
        cashierName: source === 'pos' ? pick(['Danish (Cashier)', 'Aina (Manager)']) : '',
        createdAt: at,
        updatedAt: at,
        paidAt: status === 'completed' ? at : null,
        inventoryDeducted: true,
        demo: true,
      };
      ops.push({ col: 'orders', id: order.id, type: 'set', data: order });
    }
  }
  await store.batch(ops);
  return ops.length;
}

export async function clearDemoOrders() {
  const all = await store.list('orders', { where: [['demo', '==', true]] });
  await store.batch(all.map((o) => ({ col: 'orders', id: o.id, type: 'delete' })));
  return all.length;
}

export { round2 };
