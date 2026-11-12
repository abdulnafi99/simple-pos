// TAPJERR.io — initial configuration for Selagi Coffee (menu, tables, settings).
// This is real starting configuration the admin can edit — not sales data.
import { hashCode } from './utils.js';

export const DEFAULT_SETTINGS = {
  name: 'Selagi Coffee',
  tagline: 'Smart Ordering. Seamless Business.',
  category: 'Coffee Shop / Cafe',
  logo: '',
  address: 'Kuala Lumpur, Malaysia',
  phone: '',
  email: '',
  welcome: 'Freshly brewed, made to order. Scan, sip, smile.',
  baseUrl: '',
  storeMode: 'auto', // auto | open | closed
  hours: {
    mon: { open: '08:00', close: '22:00', closed: false },
    tue: { open: '08:00', close: '22:00', closed: false },
    wed: { open: '08:00', close: '22:00', closed: false },
    thu: { open: '08:00', close: '22:00', closed: false },
    fri: { open: '08:00', close: '23:00', closed: false },
    sat: { open: '09:00', close: '23:00', closed: false },
    sun: { open: '09:00', close: '22:00', closed: false },
  },
  taxEnabled: false,
  taxLabel: 'SST',
  taxRate: 6,
  serviceEnabled: false,
  serviceRate: 10,
  serviceDineInOnly: true,
  cashRounding: true,
  dailyTarget: 1500,
  prepMinutes: 15,
  dineInQrEnabled: true,
  takeawayEnabled: true,
  autoDeductInventory: true,
  orderSound: true,
  discountPresets: [
    { id: 'staff10', name: 'Staff 10%', type: 'percent', value: 10 },
    { id: 'promo5', name: 'Promo RM5', type: 'fixed', value: 5 },
  ],
  paymentMethods: [
    { id: 'cash', name: 'Cash', type: 'cash', enabled: true, customer: true, instructions: 'Pay at the counter when you collect your order.' },
    {
      id: 'duitnow',
      name: 'DuitNow QR',
      type: 'qr',
      enabled: true,
      customer: true,
      qrImage: '',
      instructions: 'Scan the DuitNow QR with any banking or e-wallet app, then enter the transaction reference.',
    },
    {
      id: 'transfer',
      name: 'Online Transfer',
      type: 'transfer',
      enabled: true,
      customer: true,
      bank: '',
      accountName: '',
      accountNo: '',
      instructions: 'Transfer the exact amount and enter your transaction reference. Staff will verify before preparing.',
    },
    { id: 'card', name: 'Debit / Credit Card', type: 'other', enabled: false, customer: false, instructions: 'Card terminal at counter.' },
  ],
  receipt: {
    header: 'Thank you for visiting!',
    footer: 'Follow us @selagicoffee · See you again soon',
    showLogo: true,
    showAddress: true,
  },
};

export const DEFAULT_CATEGORIES = [
  { id: 'coffee', name: 'Coffee', sort: 1 },
  { id: 'signature', name: 'Signature', sort: 2 },
  { id: 'non-coffee', name: 'Non-Coffee', sort: 3 },
  { id: 'pastry', name: 'Pastry', sort: 4 },
];

const temp = (icedExtra = 1) => ({
  id: 'temp',
  name: 'Temperature',
  type: 'single',
  required: true,
  options: [
    { name: 'Iced', price: 0 },
    { name: 'Hot', price: -icedExtra },
  ],
});
const size = { id: 'size', name: 'Size', type: 'single', required: true, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 2 }] };
const milk = { id: 'milk', name: 'Milk', type: 'single', required: false, options: [{ name: 'Fresh Milk', price: 0 }, { name: 'Oat Milk', price: 2 }] };
const sugar = {
  id: 'sugar',
  name: 'Sweetness',
  type: 'single',
  required: false,
  options: [{ name: 'Normal', price: 0 }, { name: 'Less Sweet', price: 0 }, { name: 'No Sugar', price: 0 }],
};
const addons = {
  id: 'addons',
  name: 'Add-ons',
  type: 'multi',
  required: false,
  options: [
    { name: 'Extra Shot', price: 2 },
    { name: 'Vanilla Syrup', price: 1.5 },
    { name: 'Whipped Cream', price: 1.5 },
  ],
};

const P = (id, name, categoryId, price, description, extra = {}) => ({
  id,
  name,
  categoryId,
  price,
  description,
  image: '',
  enabled: true,
  soldOut: false,
  featured: false,
  popular: false,
  optionGroups: [],
  recipe: [],
  sort: 0,
  ...extra,
});

export const DEFAULT_PRODUCTS = [
  P('ice-latte', 'Ice Latte', 'coffee', 11.9, 'Double shot espresso over fresh milk and ice. Smooth and balanced.', {
    popular: true,
    sort: 1,
    optionGroups: [size, milk, sugar, addons],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'milk', qty: 200 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('americano', 'Americano', 'coffee', 8.9, 'Bold espresso lengthened with water. Clean and crisp.', {
    sort: 2,
    optionGroups: [temp(1), size, sugar, addons],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('hot-mocha', 'Hot Mocha', 'coffee', 12.9, 'Espresso, rich chocolate and steamed milk with a velvety foam.', {
    sort: 3,
    optionGroups: [size, milk, sugar, addons],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'milk', qty: 180 }, { inventoryId: 'choco', qty: 30 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('pistachio-latte', 'Pistachio Latte', 'signature', 15.9, 'House pistachio cream layered with espresso and milk. Nutty, creamy, iconic.', {
    featured: true,
    popular: true,
    sort: 1,
    optionGroups: [temp(1), size, milk, sugar],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'milk', qty: 180 }, { inventoryId: 'pistachio', qty: 25 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('mont-blanc', 'Mont Blanc Coffee', 'signature', 16.9, 'Espresso crowned with chestnut cream foam. A dessert in a cup.', {
    featured: true,
    sort: 2,
    optionGroups: [temp(1), size, sugar],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'milk', qty: 150 }, { inventoryId: 'cream', qty: 40 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('mocha-mint', 'Mocha Mint', 'signature', 14.9, 'Chocolate espresso with a cool peppermint finish.', {
    sort: 3,
    optionGroups: [temp(1), size, milk, sugar],
    recipe: [{ inventoryId: 'beans', qty: 18 }, { inventoryId: 'milk', qty: 180 }, { inventoryId: 'choco', qty: 25 }, { inventoryId: 'mint', qty: 15 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('strawberry-peanut', 'Strawberry Peanut', 'signature', 15.9, 'Strawberry jam meets roasted peanut cream over milk. Sweet, salty, fun.', {
    featured: true,
    popular: true,
    sort: 4,
    optionGroups: [size, milk, sugar],
    recipe: [{ inventoryId: 'milk', qty: 200 }, { inventoryId: 'strawberry', qty: 40 }, { inventoryId: 'peanut', qty: 25 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('matcha', 'Matcha', 'non-coffee', 13.9, 'Ceremonial-grade Uji matcha whisked with milk.', {
    popular: true,
    sort: 1,
    optionGroups: [temp(1), size, milk, sugar],
    recipe: [{ inventoryId: 'matcha', qty: 6 }, { inventoryId: 'milk', qty: 220 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('choco-mint', 'Choco Mint', 'non-coffee', 13.9, 'Dark chocolate and peppermint over milk. Caffeine-free.', {
    sort: 2,
    optionGroups: [temp(1), size, milk, sugar],
    recipe: [{ inventoryId: 'milk', qty: 220 }, { inventoryId: 'choco', qty: 35 }, { inventoryId: 'mint', qty: 15 }, { inventoryId: 'cups', qty: 1 }],
  }),
  P('donuts', 'Donuts', 'pastry', 5.9, 'Soft brioche donut, glazed fresh every morning.', {
    sort: 1,
    optionGroups: [
      {
        id: 'flavour',
        name: 'Flavour',
        type: 'single',
        required: true,
        options: [{ name: 'Classic Glaze', price: 0 }, { name: 'Chocolate', price: 0.5 }, { name: 'Pistachio', price: 1 }],
      },
    ],
    recipe: [{ inventoryId: 'donut', qty: 1 }],
  }),
];

export const DEFAULT_TABLES = Array.from({ length: 8 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `T${n}`, number: n, section: i < 6 ? 'Indoor' : 'Outdoor', seats: i % 3 === 0 ? 4 : 2, status: 'available', guests: 0, reservedFor: '', note: '' };
});

export const DEFAULT_SUPPLIERS = [
  { id: 'sup-beans', name: 'Bean Supplier', contact: '', phone: '', email: '', notes: 'Coffee beans — edit with your roaster details.' },
  { id: 'sup-dairy', name: 'Dairy Supplier', contact: '', phone: '', email: '', notes: 'Fresh milk & cream.' },
];

export const DEFAULT_INVENTORY = [
  { id: 'beans', name: 'Espresso Beans', unit: 'g', stock: 5000, lowAt: 1000, cost: 0.12, supplierId: 'sup-beans' },
  { id: 'milk', name: 'Fresh Milk', unit: 'ml', stock: 20000, lowAt: 4000, cost: 0.007, supplierId: 'sup-dairy' },
  { id: 'cream', name: 'Chestnut Cream', unit: 'g', stock: 1500, lowAt: 300, cost: 0.05, supplierId: '' },
  { id: 'choco', name: 'Chocolate Sauce', unit: 'g', stock: 3000, lowAt: 500, cost: 0.03, supplierId: '' },
  { id: 'mint', name: 'Peppermint Syrup', unit: 'ml', stock: 1000, lowAt: 200, cost: 0.04, supplierId: '' },
  { id: 'pistachio', name: 'Pistachio Paste', unit: 'g', stock: 1000, lowAt: 200, cost: 0.15, supplierId: '' },
  { id: 'strawberry', name: 'Strawberry Jam', unit: 'g', stock: 1500, lowAt: 300, cost: 0.04, supplierId: '' },
  { id: 'peanut', name: 'Peanut Cream', unit: 'g', stock: 1000, lowAt: 200, cost: 0.04, supplierId: '' },
  { id: 'matcha', name: 'Matcha Powder', unit: 'g', stock: 500, lowAt: 100, cost: 0.4, supplierId: '' },
  { id: 'cups', name: 'Cups & Lids', unit: 'pcs', stock: 500, lowAt: 100, cost: 0.35, supplierId: '' },
  { id: 'donut', name: 'Brioche Donuts', unit: 'pcs', stock: 40, lowAt: 10, cost: 1.8, supplierId: '' },
];

// Demo-mode staff accounts (only used when Firebase is NOT configured).
export const DEMO_STAFF = [
  { email: 'owner@selagi.coffee', password: 'owner123', name: 'Selagi Owner', role: 'super_admin' },
  { email: 'admin@selagi.coffee', password: 'admin123', name: 'Aina (Manager)', role: 'admin' },
  { email: 'cashier@selagi.coffee', password: 'cashier123', name: 'Danish (Cashier)', role: 'cashier' },
  { email: 'kitchen@selagi.coffee', password: 'kitchen123', name: 'Mei (Barista)', role: 'kitchen' },
];

/* ---------------- Product illustration (used when no photo is uploaded) ---------------- */
const PALETTES = [
  { k: ['matcha'], a: '#7fb069', b: '#eef6e6', bg: ['#e7f3df', '#cfe8c0'] },
  { k: ['pistachio'], a: '#a3c47a', b: '#f3eedc', bg: ['#eef4e2', '#dbe9c6'] },
  { k: ['strawberry'], a: '#e46a86', b: '#f6e7d8', bg: ['#fde8ee', '#f9cfdb'] },
  { k: ['mint'], a: '#5b3a29', b: '#bfe8d6', bg: ['#e2f5ee', '#c4eadb'] },
  { k: ['mocha', 'choco'], a: '#5b3a29', b: '#c89f7f', bg: ['#f3e9e1', '#e6d2c3'] },
  { k: ['mont blanc', 'chestnut'], a: '#6b4430', b: '#f1e3cf', bg: ['#f6ede2', '#ead8c1'] },
  { k: ['americano', 'espresso', 'black'], a: '#3b2418', b: '#6f4a35', bg: ['#efe6df', '#dccbbd'] },
  { k: ['latte', 'cappuccino', 'coffee'], a: '#8a5a3c', b: '#efdcc6', bg: ['#f5ece3', '#e8d6c3'] },
];

export function productArt(p = {}) {
  const name = String(p.name || '').toLowerCase();
  const isDonut = /donut|doughnut/.test(name) || p.categoryId === 'pastry';
  const isHot = /hot/.test(name);
  let pal = PALETTES.find((x) => x.k.some((k) => name.includes(k)));
  if (!pal) {
    const h = hashCode(name) % 360;
    pal = { a: `hsl(${h} 45% 45%)`, b: `hsl(${h} 50% 88%)`, bg: [`hsl(${h} 60% 95%)`, `hsl(${h} 50% 86%)`] };
  }
  const [g1, g2] = pal.bg;
  let body;
  if (isDonut) {
    const glaze = name.includes('choc') ? '#5b3a29' : name.includes('pistachio') ? '#a3c47a' : '#f4b8c8';
    body = `<ellipse cx="100" cy="150" rx="62" ry="10" fill="#000" opacity=".08"/>
      <circle cx="100" cy="104" r="56" fill="#e2a86b"/>
      <path d="M100 52c30 0 54 22 54 50 0 9-6 12-12 9-7-3-9 6-16 5s-6-9-14-7-8 10-15 9-6-9-13-9-9 9-16 7-5-10-11-8c-7 3-13-2-13-9 0-27 24-47 56-47z" fill="${glaze}"/>
      <circle cx="100" cy="104" r="17" fill="${g1}"/>
      <g fill="#fff" opacity=".9"><rect x="78" y="70" width="8" height="3" rx="1.5" transform="rotate(-25 82 71)"/><rect x="116" y="76" width="8" height="3" rx="1.5" transform="rotate(30 120 77)"/><rect x="128" y="98" width="8" height="3" rx="1.5" transform="rotate(-10 132 99)"/><rect x="66" y="96" width="8" height="3" rx="1.5" transform="rotate(40 70 97)"/></g>`;
  } else if (isHot) {
    body = `<ellipse cx="96" cy="160" rx="64" ry="9" fill="#000" opacity=".08"/>
      <path d="M140 92h10a20 20 0 0 1 0 40h-12" fill="none" stroke="#fff" stroke-width="10"/>
      <path d="M44 78h104l-8 70a14 14 0 0 1-14 12H66a14 14 0 0 1-14-12z" fill="#fff"/>
      <ellipse cx="96" cy="80" rx="52" ry="10" fill="${pal.a}"/>
      <ellipse cx="96" cy="80" rx="30" ry="5" fill="${pal.b}"/>
      <g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"><path d="M78 60c-6-8 6-12 0-22"/><path d="M98 58c-6-8 6-12 0-22"/><path d="M118 60c-6-8 6-12 0-22"/></g>`;
  } else {
    body = `<ellipse cx="100" cy="166" rx="48" ry="8" fill="#000" opacity=".08"/>
      <rect x="112" y="14" width="8" height="60" rx="4" transform="rotate(14 116 44)" fill="#142a9c"/>
      <path d="M58 52h84l-10 104a10 10 0 0 1-10 9H78a10 10 0 0 1-10-9z" fill="#fff" opacity=".55"/>
      <path d="M63 100h74l-6 56a10 10 0 0 1-10 9H79a10 10 0 0 1-10-9z" fill="${pal.a}"/>
      <path d="M61 74h78l-2.3 26H63.3z" fill="${pal.b}"/>
      <g fill="#fff" opacity=".85"><rect x="80" y="82" width="14" height="14" rx="3" transform="rotate(12 87 89)"/><rect x="104" y="86" width="13" height="13" rx="3" transform="rotate(-10 110 92)"/></g>
      <path d="M58 52h84" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="168" cy="30" r="40" fill="#fff" opacity=".25"/>${body}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const productImage = (p) => p?.image || productArt(p);
