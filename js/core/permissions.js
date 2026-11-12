// TAPJERR.io — role-based access control (UI side; enforced server-side by firestore.rules)

export const ROLES = {
  super_admin: { label: 'Super Admin', tone: 'indigo', desc: 'Full access including staff, settings and owner controls.' },
  admin: { label: 'Admin', tone: 'blue', desc: 'Manage menu, inventory, reports, staff (except Super Admins) and settings.' },
  cashier: { label: 'Cashier', tone: 'green', desc: 'POS, tables, takeaway, orders and customers.' },
  kitchen: { label: 'Kitchen Staff', tone: 'amber', desc: 'Kitchen Display and order status updates only.' },
};

const ALL = ['super_admin', 'admin', 'cashier', 'kitchen'];
const MGMT = ['super_admin', 'admin'];
const FRONT = ['super_admin', 'admin', 'cashier'];

export const PAGE_ACCESS = {
  overview: FRONT,
  pos: FRONT,
  tables: FRONT,
  qr: MGMT,
  takeaway: FRONT,
  orders: ALL,
  kitchen: ALL,
  products: MGMT,
  inventory: MGMT,
  customers: FRONT,
  reports: MGMT,
  staff: MGMT,
  settings: MGMT,
};

export const ACTIONS = {
  cancelOrder: FRONT,
  refundOrder: MGMT,
  applyDiscount: FRONT,
  verifyPayment: FRONT,
  editMenu: MGMT,
  manageTables: MGMT,
  loadDemoData: ['super_admin'],
  resetData: ['super_admin'],
};

export const canAccess = (role, page) => (PAGE_ACCESS[page] || []).includes(role);
export const can = (role, action) => (ACTIONS[action] || []).includes(role);
export const homeFor = (role) => (role === 'kitchen' ? 'kitchen' : 'overview');
