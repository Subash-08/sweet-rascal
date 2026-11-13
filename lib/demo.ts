export const roles = ['Owner', 'Staff'] as const;
export type Role = typeof roles[number];
export const pages = ['Overview', 'Dining tables', 'Orders', 'Billing desk', 'Bills', 'Payments', 'Customers', 'Menu', 'Reports', 'Activity', 'Staff & access', 'Settings', 'My profile'] as const;
export type Page = typeof pages[number];
export const rolePages: Record<Role, readonly Page[]> = {
  Owner: pages,
  Staff: ['Overview', 'Dining tables', 'Orders', 'Billing desk', 'Bills', 'Customers', 'My profile'],
};
export const roleNames: Record<Role, string> = { Owner: 'Vishoo Kaliapa', Staff: 'Meera Rao' };
export const methods = ['Cash', 'UPI', 'Card'] as const;
export type Method = typeof methods[number];
export const sessions = ['Bed coffee', 'Breakfast', 'Brunch', 'Elevenses', 'Lunch', 'Lupper', 'High Tea', 'Supper', 'Dinner'];
export const demoDay = '2026-11-13';
export const timeZone = 'Asia/Kolkata';
export const serviceDay = () => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export type Payment = { amount: number; method: Method; date: string };
export type Dish = { id: string; name: string; category: string; price: number; available: boolean; kind: 'Non-veg' | 'Egg' | 'Veg'; description: string };
export type Line = { id: string; name: string; price: number; quantity: number; note?: string; priceReason?: string; servedQuantity?: number };
export type Guest = { id: string; name: string; phone: string; notes: string; contactNote?: string; companions: {name: string; phone: string}[]; sync: 'Synced' | 'Sync pending' | 'No phone'; assigned: Role };
export type Table = { id: string; name: string; seats: number; area: string };
export type OrderEvent = { id: string; at: string; actor: string; action: string; detail?: string };
export type Visit = {
  tip?: number;
  kind?: 'Dine-in' | 'Parcel'; guestPhone?: string; hometown?: string; stay?: string; nativity?: string;
  extraCovers?: number; guestType?: string; relationship?: string; rating?: string; blacklist?: boolean; pickupTime?: string;
  payments?: Payment[]; servedAt?: string; guestLeftAt?: string; takenAt?: string; updatedAt?: string;
  events?: OrderEvent[]; readyForBilling?: boolean; staffId?: string; guestDetails?: 'Pending' | 'Collected' | 'Skipped';
   id: string; source: 'Walk-in' | 'Phone pre-order'; guestId: string; guest: string; table: string; covers: number; session: string; date: string; time: string; host: string; referral: string; pet: string; breed: string; seatedAt: string; notes: string; assigned: Role; items: Line[]; advance?: Payment; status: 'Draft' | 'Open' | 'Upcoming' | 'Billed' | 'Cancelled' };
export type Bill = { id: string; date: string; time: string; order: Visit; payments: Payment[]; voided?: boolean; business: Business; taxRate: number; tableName?: string };
export type Business = { name: string; address: string; phone: string; gstin: string; footer: string; taxRate: number; contactSync: boolean };
export type Staff = { id: string; name: string; role: Role; active: boolean };
export type Database = { guests: Guest[]; dishes: Dish[]; categories: string[]; tables: Table[]; orders: Visit[]; bills: Bill[]; business: Business; staff: Staff[] };
export const occupiesTable = (visit: Visit) => Boolean(visit.table) && visit.kind !== 'Parcel' && !visit.guestLeftAt &&
  (visit.status === 'Draft' || visit.status === 'Open' || visit.status === 'Billed' && Boolean(visit.takenAt));
export const rupees = (paise: number, decimals = false) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: decimals || paise % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2,
}).format(paise / 100);
export const shortDate = (day: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone }).format(new Date(day + 'T12:00:00+05:30'));
export const sumPayments = (payments: Payment[]) => payments.reduce((sum, payment) => sum + payment.amount, 0);
export function totals(items: Line[], taxRate: number) {
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const tax = Math.round(subtotal * taxRate / 100);
  return { subtotal, tax, total: subtotal + tax * 2 };
}
export function payable(order: Visit, taxRate: number) {
  return totals(order.items, taxRate).total + (order.tip ?? 0);
}
export function parseMoney(value: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value) * 100);
}
export function emptyVisit(role: Role, table = ''): Visit {
  return { id: '', source: 'Walk-in', guestId: '', guest: '', table, covers: 2, session: 'Lunch', date: demoDay, time: '', host: '', referral: '', pet: '', breed: '', seatedAt: '', notes: '', items: [], assigned: role, status: 'Open' };
}

const business: Business = {
  name: 'Sweet Rascal', address: '5 Lover’s Lane, Yercaud, Tamil Nadu 636601',
  phone: '+91 94437 00000', gstin: '33ABBPV9349P2ZS',
  footer: 'Always welcome to your second home. Gramercy!', taxRate: 2.5, contactSync: true,
};
const dishes: Dish[] = [
  { id: 'fish', name: 'Pan-fried fish', category: 'Seafood', price: 48000, available: true, kind: 'Non-veg', description: 'Lime, herbs and house spices' },
  { id: 'prawns', name: 'Butter-fried prawns', category: 'Seafood', price: 42000, available: true, kind: 'Non-veg', description: 'Golden prawns with garlic butter' },
  { id: 'chicken', name: 'Home-style chicken curry', category: 'Mains', price: 34000, available: true, kind: 'Non-veg', description: 'Slow-cooked house curry' },
  { id: 'mutton', name: 'Jaffna mutton curry', category: 'Mains', price: 49000, available: true, kind: 'Non-veg', description: 'Pepper, curry leaves and toasted spices' },
  { id: 'grill', name: 'Grilled pepper chicken', category: 'Mains', price: 39000, available: false, kind: 'Non-veg', description: 'Black pepper and charred lime' },
  { id: 'dosa', name: 'Egg dosa', category: 'Sides', price: 14000, available: true, kind: 'Egg', description: 'Crisp dosa with a soft egg centre' },
  { id: 'rice', name: 'Steamed rice', category: 'Sides', price: 9000, available: true, kind: 'Veg', description: 'A bowl of fragrant rice' },
  { id: 'pudding', name: 'Caramel pudding', category: 'Desserts', price: 16000, available: true, kind: 'Egg', description: 'Silky custard and amber caramel' },
  { id: 'coffee', name: 'Filter coffee', category: 'Drinks', price: 8500, available: true, kind: 'Veg', description: 'South Indian filter coffee' },
  { id: 'lime', name: 'Fresh lime soda', category: 'Drinks', price: 9500, available: true, kind: 'Veg', description: 'Sweet, salted or mixed' },
];
const guests: Guest[] = [
  { id: 'g1', name: 'Ananya Raman', phone: '9000000101', notes: 'Prefers a shaded table.', companions: [{ name: 'Kiran Raman', phone: '9000000102' }], sync: 'Synced', assigned: 'Staff' },
  { id: 'g2', name: 'Rohan Menon', phone: '9000000103', notes: 'Likes the home-style chicken curry.', companions: [], sync: 'Synced', assigned: 'Staff' },
  { id: 'g3', name: 'Neha Shah', phone: '9000000104', notes: '', companions: [], sync: 'Sync pending', assigned: 'Staff' },
  { id: 'g4', name: 'Dev Iyer', phone: '9000000105', notes: '', companions: [], sync: 'Synced', assigned: 'Owner' },
  { id: 'g5', name: 'Priya Nair', phone: '9000000106', notes: '', companions: [], sync: 'Synced', assigned: 'Staff' },
];
const tables: Table[] = [
  { id: 't1', name: 'Xanadu', seats: 4, area: 'Garden' }, { id: 't2', name: 'Bonsai', seats: 2, area: 'Garden' },
  { id: 't3', name: 'Fern', seats: 4, area: 'Garden' }, { id: 't4', name: 'Canopy', seats: 6, area: 'Garden' },
  { id: 't5', name: 'The Veranda', seats: 6, area: 'Veranda' }, { id: 't6', name: 'Orchid', seats: 4, area: 'Veranda' },
  { id: 't7', name: 'Cedar', seats: 2, area: 'Veranda' }, { id: 't8', name: 'Lover’s Lane', seats: 4, area: 'Veranda' },
];
function line(index: number, quantity: number): Line {
  const dish = dishes[index];
  return { id: dish.id, name: dish.name, price: dish.price, quantity };
}
const openOrders: Visit[] = [
  { ...emptyVisit('Staff', 't1'), id: 'OR-021', guestId: 'g1', guest: 'Ananya Raman', time: '12:30', covers: 4, items: [line(0, 2), line(6, 2), line(7, 2)] },
  { ...emptyVisit('Staff', 't5'), id: 'OR-022', guestId: 'g2', guest: 'Rohan Menon', time: '13:15', covers: 5, items: [line(2, 3), line(5, 4), line(9, 2)], readyForBilling: true },
  { ...emptyVisit('Staff'), id: 'OR-023', guestId: 'g3', guest: 'Neha Shah', source: 'Phone pre-order', status: 'Upcoming', session: 'Dinner', time: '18:30', covers: 3, items: [line(1, 2), line(3, 1), line(6, 3)], advance: { amount: 50000, method: 'UPI', date: demoDay } },
  { ...emptyVisit('Staff', 't8'), id: 'OR-024', guestId: 'g4', guest: 'Dev Iyer', source: 'Phone pre-order', status: 'Upcoming', session: 'Dinner', time: '19:45', covers: 4, items: [line(0, 2), line(2, 2)] },
];
const bills: Bill[] = Array.from({ length: 26 }, (_, index) => {
  const day = index < 8 ? 13 : 12 - Math.floor((index - 8) / 3);
  const date = '2026-11-' + String(day).padStart(2, '0');
  const guest = guests[(index + 4) % guests.length];
  const items = [line(index % 4, 1 + index % 3), line(5 + index % 4, 1 + index % 2)];
  const order: Visit = {
    ...emptyVisit(guest.assigned, tables[(index + 2) % tables.length].id),
    id: 'OR-H' + (26 - index), date, guest: guest.name, guestId: guest.id, guestPhone: guest.phone, items,
    time: ['13:40', '13:24', '13:10', '12:55', '12:35', '11:40', '10:30', '10:15'][index % 8],
    session: index % 7 < 5 ? 'Lunch' : index % 7 === 5 ? 'Brunch' : 'Breakfast',
    source: index % 3 === 0 ? 'Phone pre-order' : 'Walk-in', status: 'Billed',
  };
  return { id: 'SR-' + (153 - index), date, time: order.time, order, payments: [{ amount: totals(items, business.taxRate).total, method: methods[index % methods.length], date }], business, taxRate: business.taxRate, tableName: tables[(index + 2) % tables.length].name };
});
export const initialData: Database = {
  guests, dishes, categories: ['Seafood', 'Mains', 'Sides', 'Desserts', 'Drinks'], tables,
  orders: [...openOrders, ...bills.map(bill => bill.order)], bills, business,
  staff: [...roles.map((role, index) => ({ id: 's' + index, name: roleNames[role], role, active: true })), { id: 's2', name: 'Arun Kumar', role: 'Staff', active: true }],
};
