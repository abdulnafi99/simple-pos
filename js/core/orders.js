// TAPJERR.io — order business logic shared by POS, QR ordering, takeaway and KDS.
import { store } from './store.js';
import { round2, dateKey, pad, normalizePhone, uid } from './utils.js';

export const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
export const STATUS_META = {
  new: { label: 'New Order', short: 'New', tone: 'blue', icon: 'bell-ring' },
  confirmed: { label: 'Confirmed', short: 'Confirmed', tone: 'indigo', icon: 'circle-check' },
  preparing: { label: 'Preparing', short: 'Preparing', tone: 'amber', icon: 'chef-hat' },
  ready: { label: 'Ready', short: 'Ready', tone: 'green', icon: 'bell' },
  completed: { label: 'Completed', short: 'Completed', tone: 'gray', icon: 'check-check' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'red', icon: 'circle-x' },
};
export const PAYMENT_META = {
  unpaid: { label: 'Unpaid', tone: 'red' },
  pending_verification: { label: 'Verifying', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'gray' },
};
export const SOURCE_LABEL = { pos: 'POS', qr: 'Table QR', online: 'Online' };
export const OPEN_STATUSES = ['new', 'confirmed', 'preparing', 'ready'];
export const isOpen = (o) => OPEN_STATUSES.includes(o.status);

export function nextStatus(status) {
  const flow = ['new', 'confirmed', 'preparing', 'ready', 'completed'];
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

export function orderTypeLabel(o) {
  if (o.type === 'dine-in') return o.tableNumber ? `Table ${o.tableNumber}` : 'Dine-in';
  return o.source === 'online' ? 'Online Takeaway' : 'Takeaway';
}

/** Unit price for a product with selected options: [{group, name, price}] */
export function unitPrice(product, options = []) {
  return round2((Number(product.price) || 0) + options.reduce((a, o) => a + (Number(o.price) || 0), 0));
}

export function itemCount(items = []) {
  return items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
}

/**
 * Compute order totals.
 * discount: { type: 'percent'|'fixed', value, label }
 */
export function computeTotals(items, settings, { type = 'takeaway', discount = null, cash = false } = {}) {
  const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
  let discountAmount = 0;
  if (discount && discount.value > 0) {
    discountAmount = discount.type === 'percent' ? (subtotal * Math.min(100, discount.value)) / 100 : discount.value;
    discountAmount = round2(Math.min(subtotal, discountAmount));
  }
  const afterDiscount = subtotal - discountAmount;
  const serviceApplies = settings.serviceEnabled && (!settings.serviceDineInOnly || type === 'dine-in');
  const service = serviceApplies ? round2((afterDiscount * settings.serviceRate) / 100) : 0;
  const tax = settings.taxEnabled ? round2(((afterDiscount + service) * settings.taxRate) / 100) : 0;
  let total = round2(afterDiscount + service + tax);
  let rounding = 0;
  if (cash && settings.cashRounding) {
    const r = Math.round(total * 20) / 20; // Malaysian 5-sen rounding
    rounding = round2(r - total);
    total = round2(r);
  }
  return { subtotal, discountAmount, service, tax, rounding, total };
}

export function formatOrderNo(dk, n) {
  return `TAP-${dk}-${pad(n, 3)}`;
}

/** Public, PII-free mirror used for order tracking by order number. */
function statusMirror(o) {
  return {
    orderNo: o.orderNo,
    status: o.status,
    paymentStatus: o.paymentStatus,
    type: o.type,
    source: o.source,
    tableNumber: o.tableNumber || '',
    total: o.total,
    itemCount: itemCount(o.items),
    items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
    pickupAt: o.pickupAt || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    history: (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at })),
  };
}

/**
 * Create an order (POS, QR or online). Returns the stored order.
 * data: { source, type, tableId, tableNumber, customer, items, discount, paymentMethod,
 *         paymentStatus, paymentRef, pickupAt, note, guests, cashier, status }
 */
export async function createOrder(data, settings) {
  const now = Date.now();
  const dk = dateKey(now);
  const n = await store.nextCounter(`orders-${dk}`);
  const orderNo = formatOrderNo(dk, n);
  const totals = computeTotals(data.items, settings, { type: data.type, discount: data.discount, cash: data.paymentMethod === 'cash' && data.paymentStatus === 'paid' });
  const status = data.status || 'new';
  const order = {
    id: uid(20),
    orderNo,
    source: data.source,
    type: data.type,
    tableId: data.tableId || '',
    tableNumber: data.tableNumber || '',
    guests: Number(data.guests) || 0,
    customer: {
      name: (data.customer?.name || '').slice(0, 80),
      phone: normalizePhone(data.customer?.phone || ''),
    },
    items: data.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: round2(i.price),
      qty: Math.max(1, Math.min(99, Number(i.qty) || 1)),
      options: i.options || [],
      note: (i.note || '').slice(0, 200),
      ...(i.custom ? { custom: true } : {}),
    })),
    subtotal: totals.subtotal,
    discount: data.discount && totals.discountAmount ? { label: data.discount.label || '', type: data.discount.type, value: data.discount.value, amount: totals.discountAmount } : null,
    serviceCharge: totals.service,
    tax: totals.tax,
    rounding: totals.rounding,
    total: totals.total,
    paymentMethod: data.paymentMethod || '',
    paymentStatus: data.paymentStatus || 'unpaid',
    paymentRef: (data.paymentRef || '').slice(0, 80),
    cashReceived: data.cashReceived ?? null,
    change: data.change ?? null,
    pickupAt: data.pickupAt || null,
    note: (data.note || '').slice(0, 300),
    status,
    statusHistory: [{ status, at: now, by: data.cashier?.name || (data.source === 'pos' ? 'Staff' : 'Customer') }],
    cashierId: data.cashier?.id || '',
    cashierName: data.cashier?.name || '',
    createdAt: now,
    updatedAt: now,
    inventoryDeducted: false,
    ...(data.demo ? { demo: true } : {}),
  };
  if (order.paymentStatus === 'paid') order.paidAt = now;
  await store.batch([
    { col: 'orders', id: order.id, type: 'set', data: order },
    { col: 'orderStatus', id: orderNo, type: 'set', data: statusMirror(order) },
  ]);
  return order;
}

async function saveOrder(order, patch) {
  const next = { ...order, ...patch, updatedAt: Date.now() };
  await store.batch([
    { col: 'orders', id: order.id, type: 'update', data: { ...patch, updatedAt: next.updatedAt } },
    { col: 'orderStatus', id: order.orderNo, type: 'set', data: statusMirror(next) },
  ]);
  return next;
}

export async function updateStatus(order, status, by = 'Staff', settings = null) {
  if (order.status === status) return order;
  const history = [...(order.statusHistory || []), { status, at: Date.now(), by }];
  const patch = { status, statusHistory: history };
  if (status === 'completed') patch.completedAt = Date.now();
  let next = await saveOrder(order, patch);
  if (status === 'completed' && settings?.autoDeductInventory && !order.inventoryDeducted) {
    try {
      await deductInventory(next, by);
      next = { ...next, inventoryDeducted: true };
    } catch (e) {
      console.warn('[TAPJERR] inventory deduction failed', e);
    }
  }
  return next;
}

export async function markPaid(order, { method, ref = '', cashReceived = null, by = 'Staff', settings } = {}) {
  const patch = { paymentStatus: 'paid', paymentMethod: method || order.paymentMethod, paidAt: Date.now(), paidBy: by };
  if (ref) patch.paymentRef = ref;
  if (method === 'cash' && settings?.cashRounding) {
    const raw = round2(order.total - (order.rounding || 0));
    const r = Math.round(raw * 20) / 20;
    patch.rounding = round2(r - raw);
    patch.total = round2(r);
  }
  if (cashReceived != null) {
    patch.cashReceived = round2(cashReceived);
    patch.change = round2(cashReceived - (patch.total ?? order.total));
  }
  return saveOrder(order, patch);
}

export async function setPaymentStatus(order, paymentStatus, by = 'Staff') {
  return saveOrder(order, { paymentStatus, paymentUpdatedBy: by });
}

export async function updateOrderItems(order, items, settings) {
  const totals = computeTotals(items, settings, { type: order.type, discount: order.discount });
  return saveOrder(order, {
    items,
    subtotal: totals.subtotal,
    serviceCharge: totals.service,
    tax: totals.tax,
    total: totals.total,
    discount: order.discount ? { ...order.discount, amount: totals.discountAmount } : null,
  });
}

export async function deductInventory(order, by = 'System') {
  const [products, inventory] = await Promise.all([store.list('products'), store.list('inventory')]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const usage = new Map();
  for (const it of order.items) {
    const p = pMap.get(it.productId);
    (p?.recipe || []).forEach((r) => usage.set(r.inventoryId, (usage.get(r.inventoryId) || 0) + Number(r.qty) * it.qty));
  }
  const ops = [];
  const now = Date.now();
  for (const [invId, qty] of usage) {
    const inv = inventory.find((i) => i.id === invId);
    if (!inv || !qty) continue;
    ops.push({ col: 'inventory', id: invId, type: 'update', data: { stock: round2((inv.stock || 0) - qty) } });
    ops.push({
      col: 'stockMoves',
      id: uid(),
      type: 'set',
      data: { inventoryId: invId, itemName: inv.name, unit: inv.unit, type: 'sale', qty: -qty, note: `Order ${order.orderNo}`, orderId: order.id, by, createdAt: now },
    });
  }
  ops.push({ col: 'orders', id: order.id, type: 'update', data: { inventoryDeducted: true } });
  await store.batch(ops);
}

/** Aggregate customers from orders (by phone), merged with saved customer profiles. */
export function buildCustomers(orders, profiles = []) {
  const map = new Map();
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  for (const o of orders) {
    const phone = o.customer?.phone;
    if (!phone) continue;
    const c = map.get(phone) || { id: phone, phone, name: '', totalOrders: 0, totalSpent: 0, lastOrderAt: 0, firstOrderAt: Infinity, orders: [] };
    if (o.customer.name && (!c.name || o.createdAt >= c.lastOrderAt)) c.name = o.customer.name;
    c.orders.push(o);
    if (o.status !== 'cancelled') {
      c.totalOrders += 1;
      if (o.paymentStatus === 'paid') c.totalSpent = round2(c.totalSpent + o.total);
    }
    c.lastOrderAt = Math.max(c.lastOrderAt, o.createdAt);
    c.firstOrderAt = Math.min(c.firstOrderAt, o.createdAt);
    map.set(phone, c);
  }
  for (const p of profiles) {
    const c = map.get(p.id) || { id: p.id, phone: p.id, name: p.name, totalOrders: 0, totalSpent: 0, lastOrderAt: 0, firstOrderAt: p.createdAt || 0, orders: [] };
    c.name = p.name || c.name;
    c.notes = p.notes || '';
    c.email = p.email || '';
    map.set(p.id, c);
  }
  return [...map.values()].map((c) => ({ ...c, notes: c.notes ?? profileMap.get(c.id)?.notes ?? '' }));
}

/** Is the store open right now according to settings? */
export function storeOpenNow(settings, at = new Date()) {
  if (settings.storeMode === 'open') return true;
  if (settings.storeMode === 'closed') return false;
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][at.getDay()];
  const h = settings.hours?.[day];
  if (!h || h.closed) return false;
  const mins = at.getHours() * 60 + at.getMinutes();
  const [oh, om] = h.open.split(':').map(Number);
  const [ch, cm] = h.close.split(':').map(Number);
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}

export function todayHours(settings, at = new Date()) {
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][at.getDay()];
  return settings.hours?.[day];
}

export function fmt12(hhmm = '00:00') {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Live table status derived from stored status + open orders. */
export function tableState(table, orders) {
  const open = orders.filter((o) => o.tableId === table.id && isOpen(o));
  const unpaid = orders.filter((o) => o.tableId === table.id && o.status !== 'cancelled' && o.paymentStatus !== 'paid' && o.paymentStatus !== 'refunded' && (isOpen(o) || o.status === 'completed') && !o.tableClosed);
  const billOrders = [...new Map([...open, ...unpaid].map((o) => [o.id, o])).values()];
  let status = table.status || 'available';
  if (billOrders.length) status = 'occupied';
  return { status, openOrders: billOrders, bill: round2(billOrders.reduce((a, o) => a + o.total, 0)), guests: table.guests || billOrders.reduce((a, o) => Math.max(a, o.guests || 0), 0) };
}

export function paymentMethodName(settings, id) {
  return settings?.paymentMethods?.find((m) => m.id === id)?.name || (id ? id : '—');
}
