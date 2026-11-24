import 'server-only';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { ClientSession } from 'mongoose';
import { ApiError, type WorkspaceUser } from './auth';
import { connectDatabase } from './database';
import { AuditModel, BusinessModel, CatalogModel, CounterModel, CustomerModel, InvoiceModel, OrderModel, RefundModel, UserModel, ensureReadIndexes } from './models';
import { discountAmount, occupiesTable, payable, serviceDay, sumPayments, totals, type Bill, type Business, type Database, type Refund, type Visit } from '../demo';

const text = z.string().max(2000);
const key = z.string().max(100);
const money = z.number().int().min(0).max(999_999_999);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const at = new Date(value + 'T12:00:00Z');
  return Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value;
}, 'Enter a valid calendar date.');
const method = z.enum(['Cash', 'UPI', 'Card']);
const payment = z.object({ amount: money.refine(value => value > 0, 'Payment must be greater than zero.'), method, date: day });
const line = z.object({ id: key.min(1), name: text.trim().min(1).max(120), price: money, quantity: z.number().int().min(1).max(99),
  note: text.optional(), priceReason: text.optional(), servedQuantity: z.number().int().min(0).max(99).optional() });
const visitInput = z.object({
  id: key, revision: z.number().int().nonnegative().optional(), taxRate: z.number().min(0).max(50).optional(), tip: money.optional(),
  kind: z.enum(['Dine-in', 'Parcel']).default('Dine-in'), source: z.enum(['Walk-in', 'Phone pre-order', 'Online']),
  guestId: key, guest: text.max(120), guestPhone: z.string().max(24).optional(), table: key,
  covers: z.number().int().min(0).max(99), extraCovers: z.number().int().min(0).max(99).optional(),
  session: text.max(40), date: day, time: z.string().max(8),
  host: text, referral: text, pet: text, breed: text, seatedAt: text.max(8), notes: text, assigned: z.enum(['Owner', 'Staff']),
  hometown: text.optional(), stay: text.optional(), nativity: text.optional(), guestType: text.optional(), relationship: text.optional(), rating: text.optional(),
  blacklist: z.boolean().optional(), pickupTime: text.max(8).optional(), payments: z.array(payment).max(30).optional(), advance: payment.optional(),
  servedAt: text.optional(), guestLeftAt: text.optional(), takenAt: text.optional(), updatedAt: text.optional(),
  discount: z.object({ kind: z.enum(['percent', 'amount']), value: z.number().positive().max(999_999_999), reason: text.trim().min(1).max(240),
    subtotal: money, approver: text.optional(), pending: z.boolean() }).optional(),
  readyForBilling: z.boolean().optional(), staffId: key.optional(), guestDetails: z.enum(['Pending', 'Collected', 'Skipped']).optional(),
  items: z.array(line).max(150), status: z.enum(['Draft', 'Open', 'Upcoming', 'Billed', 'Cancelled']),
});
export const catalogInput = z.object({
  revision: z.number().int().nonnegative(),
  dishes: z.array(z.object({ id: key.min(1), name: text.trim().min(1).max(120), category: text.trim().min(1).max(80), price: money.refine(value => value > 0),
    available: z.boolean(), kind: z.enum(['Non-veg', 'Egg', 'Veg']), description: text.max(500) })).max(1000),
  categories: z.array(text.trim().min(1).max(80)).max(100),
  tables: z.array(z.object({ id: key.min(1), name: text.trim().min(1).max(80), seats: z.number().int().min(1).max(99), area: text.trim().min(1).max(80) })).max(200),
});
const emptyCatalog = { dishes: [], categories: [], tables: [] };
type Catalog = Pick<Database, 'dishes' | 'categories' | 'tables'>;
const event = (user: WorkspaceUser, action: string, detail?: string) => ({ id: randomUUID(), at: new Date().toISOString(), actor: user.name, action, detail });
// BSON Mixed fields can otherwise turn JavaScript undefined into null, which
// breaks subsequent validated edits of optional visit fields.
const snapshot = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const owner = (user: WorkspaceUser) => { if (user.role !== 'Owner') throw new ApiError(403, 'Owner access is required.'); };
const conflict = () => new ApiError(409, 'This record changed on another device. Reopen it before saving. Your changes have not been applied.');

/** A short shared write serializes table claims, numbering and refunds across devices. */
async function transaction<T>(work: (session: ClientSession) => Promise<T>) {
  const database = await connectDatabase();
  await CounterModel.updateOne({ _id: 'operations' }, { $setOnInsert: { value: 0 } }, { upsert: true });
  let result: T;
  await database.connection.transaction(async session => {
    await CounterModel.updateOne({ _id: 'operations' }, { $inc: { value: 1 } }, { session });
    result = await work(session);
  });
  return result!;
}
async function catalog(session?: ClientSession) {
  const value = await CatalogModel.findById('restaurant').session(session ?? null).lean();
  return { ...(value?.payload ?? emptyCatalog) as Catalog, revision: value?.revision ?? 0 };
}
async function business(session?: ClientSession): Promise<Business> {
  const value = await BusinessModel.findById('restaurant').session(session ?? null).lean();
  if (!value) throw new ApiError(409, 'Save the restaurant settings first.');
  const { name, address, phone, gstin, footer, taxRate, contactSync, staffDiscountLimit, revision } = value;
  return { name, address, phone, gstin, footer, taxRate, contactSync, staffDiscountLimit, revision };
}
export async function operationsVersion() {
  const counter = await CounterModel.findById('operations').select('value').lean();
  return `${serviceDay()}:${counter?.value ?? 0}`;
}

export async function loadOperations(user: WorkspaceUser, syncVersion?: string) {
  // Read the version first so a concurrent save is checked again on the next poll.
  syncVersion ??= await operationsVersion();
  await ensureReadIndexes();
  const [menu, orders, recent, staff] = await Promise.all([
    catalog(), OrderModel.find({ $or: [{ status: { $in: ['Draft', 'Open', 'Upcoming'] } }, { occupied: true }] }).select('payload').sort({ updatedAt: -1 }).lean(),
    InvoiceModel.find(user.role === 'Staff' ? { date: serviceDay() } : {}).select('payload').sort({ date: -1, _id: -1 }).limit(8).lean(),
    UserModel.find({ active: true }).select('_id name role active').sort({ name: 1 }).lean(),
  ]);
  const occupiedIds = orders.filter(row => (row.payload as Visit).status === 'Billed').map(row => (row.payload as Visit).id);
  const occupiedBills = occupiedIds.length ? await InvoiceModel.find({ orderId: { $in: occupiedIds } }).select('payload').lean() : [];
  const bills = [...new Map([...recent, ...occupiedBills].map(row => [row.payload.id as string, row.payload as Bill])).values()];
  const recentOrderIds = bills.map(bill => bill.order.id).filter(id => !orders.some(row => (row.payload as Visit).id === id));
  const recentOrders = recentOrderIds.length ? await OrderModel.find({ _id: { $in: recentOrderIds } }).select('payload').lean() : [];
  const refunds = bills.length ? await RefundModel.find({ billId: { $in: bills.map(bill => bill.id) } }).select('payload').lean() : [];
  return { ...menu, syncVersion, orders: [...orders, ...recentOrders].map(row => row.payload), bills,
    refunds: refunds.map(row => row.payload),
    staff: staff.map(row => ({ id: row._id, name: row.name, role: row.role, active: row.active })) };
}

export async function saveCatalog(input: unknown, user: WorkspaceUser) {
  const value = catalogInput.parse(input);
  function unique(values: string[], name: string) {
    if (new Set(values.map(item => item.toLocaleLowerCase('en-IN'))).size !== values.length) throw new ApiError(400, 'Use unique ' + name + '.');
  }
  unique(value.categories, 'category names'); unique(value.dishes.map(row => row.id), 'dish IDs'); unique(value.tables.map(row => row.id), 'table IDs');
  unique(value.dishes.map(row => row.name), 'dish names'); unique(value.tables.map(row => row.name), 'table names');
  if (value.dishes.some(row => !value.categories.includes(row.category))) throw new ApiError(400, 'Choose an existing category for every dish.');
  return transaction(async session => {
    const previous = await catalog(session);
    if (previous.revision !== value.revision) throw conflict();
    const previousDishIds = new Set(previous.dishes.map(dish => dish.id));
    const addedDishes = value.dishes.filter(dish => !previousDishIds.has(dish.id));
    const nextTables = new Map(value.tables.map(table => [table.id, table]));
    if (user.role !== 'Owner') {
      const existingDishes = value.dishes.filter(dish => previousDishIds.has(dish.id));
      if (!isDeepStrictEqual(previous.dishes, existingDishes) || !isDeepStrictEqual(previous.categories, value.categories)
        || previous.tables.some(table => !isDeepStrictEqual(table, nextTables.get(table.id)))) {
        throw new ApiError(403, 'Staff can add dishes and tables. Ask the owner to edit existing dishes, categories or tables.');
      }
    }
    const reducedTableIds = previous.tables.filter(table => (nextTables.get(table.id)?.seats ?? 0) < table.seats).map(table => table.id);
    if (reducedTableIds.length) {
      const active = await OrderModel.find({ table: { $in: reducedTableIds }, status: { $in: ['Draft', 'Open', 'Upcoming', 'Billed'] } }).session(session).select('payload').lean();
      for (const row of active) {
        const order = row.payload as Visit;
        if (!occupiesTable(order) && order.status !== 'Upcoming') continue;
        const table = nextTables.get(order.table);
        if (!table || table.seats < order.covers + (order.extraCovers ?? 0)) throw new ApiError(409, 'A current order needs this table and its existing seats.');
      }
    }
    const { revision, ...payload } = value;
    await CatalogModel.updateOne({ _id: 'restaurant' }, { $set: { payload, revision: revision + 1 } }, { upsert: true, session });
    await AuditModel.create([{ actor: user.name, action: addedDishes.length ? 'Dishes added to menu' : 'Menu / tables updated',
      entityId: 'catalog', detail: addedDishes.map(dish => dish.name).join(', ').slice(0, 500) }], { session });
    return { ...payload, revision: revision + 1 };
  });
}

async function validateOrder(value: Visit, previous: Visit | undefined, user: WorkspaceUser, session: ClientSession, issuing = false) {
  const settings = await business(session);
  const menu = await catalog(session);
  value.taxRate = previous?.taxRate ?? settings.taxRate;
  if (value.staffId && !await UserModel.exists({ _id: value.staffId, active: true }).session(session)) throw new ApiError(400, 'Choose an active waiter.');
  if (value.guestId && !await CustomerModel.exists({ _id: value.guestId }).session(session)) throw new ApiError(400, 'Choose an existing customer or clear the customer selection.');
  if ((issuing || value.status === 'Open') && value.kind !== 'Parcel' && !value.table) throw new ApiError(400, 'Choose a dining table. Parcel orders do not need a table.');
  const table = menu.tables.find(row => row.id === value.table);
  if (value.table && (!table || value.kind !== 'Parcel' && table.seats < value.covers + (value.extraCovers ?? 0))) throw new ApiError(400, 'Choose a valid table with enough seats.');
  if (occupiesTable(value) && await OrderModel.exists({ _id: { $ne: value.id }, table: value.table, occupied: true }).session(session)) throw new ApiError(409, 'This table is occupied on another device. Choose another table.');
  if (value.table && value.status === 'Upcoming') {
    const reservations = await OrderModel.find({ _id: { $ne: value.id }, table: value.table, status: 'Upcoming' }).session(session).lean();
    if (reservations.some(row => row.payload.date === value.date && row.payload.time === value.time)) throw new ApiError(409, 'This table has a pre-order at that time.');
  }
  if (new Set(value.items.map(row => row.id)).size !== value.items.length) throw new ApiError(400, 'Combine duplicate dish rows.');
  for (const line of value.items) {
    const old = previous?.items.find(row => row.id === line.id);
    const dish = menu.dishes.find(row => row.id === line.id);
    if ((line.servedQuantity ?? 0) > line.quantity) throw new ApiError(400, 'Served quantity cannot exceed ordered quantity.');
    if (!dish && !old && !line.id.startsWith('special-')) throw new ApiError(400, 'This dish no longer exists. Reopen the menu.');
    if (dish && !dish.available && line.quantity > (old?.quantity ?? 0)) throw new ApiError(409, line.name + ' is sold out.');
    if ((!old && (!dish || dish.price !== line.price) || old && old.price !== line.price) && !line.priceReason?.trim()) throw new ApiError(400, 'Add a reason for the changed dish price.');
  }
  const subtotal = totals(value.items, value.taxRate).subtotal;
  if (value.discount) {
    const saving = discountAmount(value.discount, subtotal);
    if (saving <= 0 || saving > subtotal || value.discount.kind === 'percent' && value.discount.value > 100) throw new ApiError(400, 'Check the discount amount.');
    const overLimit = saving * 100 > subtotal * (settings.staffDiscountLimit ?? 10);
    const approved = previous?.discount;
    const unchangedApproval = Boolean(approved?.approver && !approved.pending && approved.subtotal === subtotal &&
      approved.kind === value.discount.kind && approved.value === value.discount.value && approved.reason === value.discount.reason && value.discount.subtotal === subtotal);
    value.discount = { ...value.discount, pending: overLimit && user.role !== 'Owner' && !unchangedApproval,
      approver: overLimit ? user.role === 'Owner' ? user.name : unchangedApproval ? previous?.discount?.approver : undefined : undefined };
    if (issuing && (value.discount.pending || value.discount.subtotal !== subtotal)) throw new ApiError(400, 'Review the discount and get owner approval before issuing.');
  }
  const paid = sumPayments(value.payments ?? []) + (value.advance?.amount ?? 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 999_999_999 || paid > payable(value, value.taxRate)) throw new ApiError(400, 'Recorded payments exceed the bill. Correct the payments or advance first.');
  if (issuing && (!value.items.length || paid !== payable(value, value.taxRate))) throw new ApiError(400, 'Add dishes and record the full balance before issuing.');
  if (issuing && value.taxRate > 0 && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(settings.gstin)) throw new ApiError(400, 'The owner must save a valid GSTIN before issuing a taxable bill.');
  return settings;
}

export async function orderCommand(input: unknown, user: WorkspaceUser) {
  const command = z.object({ type: z.enum(['save', 'issue', 'depart', 'unpaid', 'log']), order: visitInput,
    requestId: z.string().uuid().optional(), action: z.string().trim().max(300).default('Order saved') }).parse(input);
  return transaction(async session => {
    const existing = command.order.id ? await OrderModel.findById(command.order.id).session(session).lean() : command.requestId ? await OrderModel.findOne({ requestId: command.requestId }).session(session).lean() : null;
    const previous = existing?.payload as Visit | undefined;
    if (previous && !command.order.id && command.type === 'save') return { order: previous };
    const issued = command.type === 'issue' || previous?.status === 'Billed' ? await InvoiceModel.findOne({ orderId: command.order.id }).session(session).lean() : null;
    if (user.role !== 'Owner' && previous && !['Draft', 'Open', 'Upcoming'].includes(previous.status) && !occupiesTable(previous) &&
      previous.date !== serviceDay() && (issued?.payload as Bill | undefined)?.date !== serviceDay()) throw new ApiError(403, 'Only the owner can open historical orders and bills.');
    if (command.type === 'issue') {
      if (issued) {
        if (user.role !== 'Owner' && (issued.payload as Bill).date !== serviceDay() && (!previous || !occupiesTable(previous))) throw new ApiError(403, 'Only the owner can open historical bills.');
        return { order: previous!, bill: issued.payload as Bill };
      }
    }
    if (existing && existing.revision !== command.order.revision) throw conflict();
    if (!existing && command.order.revision !== undefined) throw new ApiError(404, 'Order not found.');
    if (previous?.status === 'Cancelled') throw new ApiError(409, 'This order is cancelled.');
    if (previous?.status === 'Billed' && !['depart', 'log'].includes(command.type)) throw new ApiError(409, 'Issued bills cannot be edited. Use Refund / cancel bill.');
    const now = new Date().toISOString();
    let order: Visit;
    if (command.type === 'depart' || command.type === 'log' || command.type === 'unpaid') {
      if (!previous || command.type === 'depart' && previous.status !== 'Billed') throw new ApiError(400, 'Issue the bill before confirming departure.');
      if (command.type === 'unpaid' && (previous.status !== 'Open' || payable(previous, previous.taxRate ?? 0) <= sumPayments(previous.payments ?? []) + (previous.advance?.amount ?? 0))) throw new ApiError(400, 'Only record an unpaid departure for an open order with an outstanding balance.');
      if (command.type === 'depart' && previous.guestLeftAt) return { order: previous };
      order = { ...previous, ...(['depart', 'unpaid'].includes(command.type) ? { guestLeftAt: now, readyForBilling: true } : {}) };
    } else {
      if (command.order.status === 'Billed') throw new ApiError(400, 'Use Issue bill to finalise an order.');
      if (command.order.guestLeftAt && !previous?.guestLeftAt) throw new ApiError(400, 'Issue the bill and confirm departure after payment.');
      if (command.order.status === 'Cancelled' && ((previous?.advance?.amount ?? 0) + sumPayments(previous?.payments ?? []) > 0 || (command.order.advance?.amount ?? 0) + sumPayments(command.order.payments ?? []) > 0)) throw new ApiError(400, 'This order has recorded payments. Issue and refund its bill to keep the payment history.');
      let id = command.order.id;
      if (!id) {
        const day = serviceDay().replaceAll('-', '').slice(2);
        const next = await CounterModel.findByIdAndUpdate('order-' + day, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session }).lean();
        id = 'OR' + day + '-' + String(next!.value).padStart(3, '0');
      }
      order = { ...command.order, id,
        takenAt: previous?.takenAt ?? (command.order.takenAt ? now : undefined),
        servedAt: previous?.servedAt ?? (command.order.servedAt ? now : undefined), guestLeftAt: previous?.guestLeftAt };
      if (command.type === 'issue') { order.status = 'Open'; order.takenAt ??= now; }
      await validateOrder(order, previous, user, session, command.type === 'issue');
    }
    const changes: string[] = [];
    if (!previous) changes.push('Order created');
    if (previous && previous.table !== order.table) changes.push('Table changed: ' + previous.table + ' → ' + order.table);
    if (previous && previous.staffId !== order.staffId) changes.push('Assigned waiter changed');
    if (JSON.stringify(previous?.items) !== JSON.stringify(order.items)) changes.push('Dishes / prices updated');
    for (const line of order.items) {
      const old = previous?.items.find(row => row.id === line.id);
      if (!old || old.price !== line.price || old.quantity !== line.quantity) changes.push(line.name + ': ' + (old ? old.quantity + ' × ₹' + (old.price / 100).toFixed(2) + ' → ' : '') + line.quantity + ' × ₹' + (line.price / 100).toFixed(2) + (line.priceReason ? ' · ' + line.priceReason : ''));
    }
    for (const line of previous?.items ?? []) if (!order.items.some(row => row.id === line.id)) changes.push('Removed ' + line.name);
    if (JSON.stringify(previous?.payments) !== JSON.stringify(order.payments) || JSON.stringify(previous?.advance) !== JSON.stringify(order.advance)) changes.push('Payments updated');
    if (JSON.stringify(previous?.discount) !== JSON.stringify(order.discount)) changes.push('Discount updated');
    if (previous?.tip !== order.tip) changes.push('Tip updated');
    order.revision = (existing?.revision ?? -1) + 1;
    order.updatedAt = now;
    order.events = [...(previous?.events ?? []), event(user, command.action, changes.join(' · '))];
    let bill: Bill | undefined;
    if (command.type === 'issue') {
      const settings = await business(session);
      const day = serviceDay(), year = Number(day.slice(0, 4)) - (Number(day.slice(5, 7)) < 4 ? 1 : 0);
      const series = String(year).slice(2) + String(year + 1).slice(2);
      const counter = await CounterModel.findByIdAndUpdate('invoice-' + series, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session }).lean();
      if (counter!.value > 999999) throw new ApiError(409, 'Invoice series is full. Contact the owner.');
      const id = 'SR' + series + '/' + String(counter!.value).padStart(6, '0');
      order.status = 'Billed'; order.takenAt ??= now;
      order.events.push(event(user, 'Bill issued', id));
      bill = { id, order: { ...order }, date: day, time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()),
        payments: order.payments ?? [], taxRate: order.taxRate!, business: { ...settings, taxRate: order.taxRate! },
        tableName: (await catalog(session)).tables.find(row => row.id === order.table)?.name };
      await InvoiceModel.create([{ _id: id, orderId: order.id, date: day, payload: snapshot(bill) }], { session });
    }
    await OrderModel.updateOne({ _id: order.id }, { $set: { payload: snapshot(order), status: order.status, table: order.table, occupied: occupiesTable(order), revision: order.revision },
      ...(!existing && command.requestId ? { $setOnInsert: { requestId: command.requestId } } : {}) }, { upsert: true, session });
    await AuditModel.create([{ actor: user.name, action: command.action, entityId: order.id, detail: changes.join(' · ') }], { session });
    return { order, bill };
  });
}

export async function linkBilledCustomer(input: unknown, user: WorkspaceUser) {
  owner(user);
  const { orderId, customerId } = z.object({ orderId: key.min(1), customerId: key.min(1) }).parse(input);
  return transaction(async session => {
    const record = await OrderModel.findById(orderId).session(session).lean();
    const invoice = await InvoiceModel.findOne({ orderId }).session(session).lean();
    if (!record || record.status !== 'Billed' || !invoice || (invoice.payload as Bill).voided) throw new ApiError(409, 'Choose an issued order with an active bill.');
    const order = record.payload as Visit;
    if (order.guestId === customerId) return { order };
    const issuedGuest = (invoice.payload as Bill).order;
    if ([order, issuedGuest].some(visit => visit.guestId || visit.guest?.trim() || visit.guestPhone?.trim())) {
      throw new ApiError(409, 'This billed order already has customer details. They cannot be reassigned.');
    }
    if (await RefundModel.exists({ billId: invoice._id, 'payload.cancelled': true }).session(session)) throw new ApiError(409, 'This bill was cancelled.');
    const guest = await CustomerModel.findById(customerId).select('name phone').session(session).lean();
    if (!guest) throw new ApiError(404, 'Choose an existing customer.');
    const entry = event(user, 'Customer linked after billing', guest.name);
    const updated: Visit = { ...order, guestId: customerId, guest: guest.name, guestPhone: guest.phone,
      guestDetails: 'Collected', revision: record.revision + 1, updatedAt: entry.at, events: [...(order.events ?? []), entry] };
    await OrderModel.updateOne({ _id: orderId }, { $set: { payload: snapshot(updated), revision: updated.revision } }, { session });
    await AuditModel.create([{ actor: user.name, action: entry.action, entityId: orderId, detail: customerId }], { session });
    return { order: updated };
  });
}

export async function refundCommand(input: unknown, user: WorkspaceUser) {
  owner(user);
  const value = z.object({ id: z.string().uuid(), billId: key, amount: money.refine(value => value > 0), method,
    reason: z.string().trim().min(1).max(240), cancelled: z.boolean() }).parse(input);
  return transaction(async session => {
    const duplicate = await RefundModel.findById(value.id).session(session).lean();
    if (duplicate) {
      const saved = duplicate.payload as Refund;
      if (saved.billId !== value.billId || saved.amount !== value.amount || saved.method !== value.method || saved.reason !== value.reason || saved.cancelled !== value.cancelled) throw new ApiError(409, 'This refund was already processed. Reopen the bill to see its remaining balance.');
      return { refund: saved };
    }
    const invoice = await InvoiceModel.findById(value.billId).session(session).lean();
    if (!invoice) throw new ApiError(404, 'Bill not found.');
    const bill = invoice.payload as Bill;
    const previous = (await RefundModel.find({ billId: value.billId }).session(session).lean()).map(row => row.payload as Refund);
    const remaining = payable(bill.order, bill.taxRate) - previous.reduce((sum, row) => sum + row.amount, 0);
    if (value.amount > remaining || value.cancelled && value.amount !== remaining) throw new ApiError(409, 'Check the remaining refundable balance. Reopen this bill.');
    const total = totals(bill.order.items, bill.taxRate, bill.order.discount);
    const salesRemaining = Math.max(0, total.total - previous.reduce((sum, row) => sum + row.salesAmount, 0));
    const taxRemaining = Math.max(0, total.tax * 2 - previous.reduce((sum, row) => sum + row.taxAmount, 0));
    const salesAmount = Math.min(value.amount, salesRemaining);
    const refund: Refund = { ...value, salesAmount, taxAmount: salesRemaining ? Math.round(taxRemaining * salesAmount / salesRemaining) : 0,
      tipAmount: value.amount - salesAmount, at: new Date().toISOString(), actor: user.name };
    await RefundModel.create([{ _id: value.id, billId: value.billId, payload: refund }], { session });
    const storedOrder = await OrderModel.findById(bill.order.id).session(session).lean();
    let order: Visit | undefined;
    if (storedOrder) {
      const previousOrder = storedOrder.payload as Visit;
      order = { ...previousOrder, revision: storedOrder.revision + 1, updatedAt: refund.at,
        events: [...(previousOrder.events ?? []), event(user, value.cancelled ? 'Bill refunded and cancelled' : 'Refund recorded',
          bill.id + ' · ₹' + (value.amount / 100).toFixed(2) + ' · ' + value.method + ' · ' + value.reason)] };
      await OrderModel.updateOne({ _id: order.id }, { $set: { payload: snapshot(order), revision: order.revision } }, { session });
    }
    await AuditModel.create([{ actor: user.name, action: value.cancelled ? 'Bill refunded and cancelled' : 'Refund recorded', entityId: value.billId, detail: value.reason }], { session });
    return { refund, order };
  });
}
