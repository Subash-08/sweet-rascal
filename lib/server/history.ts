import 'server-only';
import { csvResponse, xlsxResponse } from './tabular-export';
import { createHash } from 'node:crypto';
import type { PipelineStage } from 'mongoose';
import { ApiError, type WorkspaceUser } from './auth';
import { InvoiceModel, OrderModel, RefundModel } from './models';
import { occupiesTable, serviceDay, type Bill, type Visit } from '../demo';
import type { HistoryResource, HistoryResponse, HistoryRow, HistorySort, OverviewResponse } from '../history';

const pageSize = 20;
const resources = ['bills', 'sales', 'refunds', 'activity', 'payments'] as const;
const sorts = ['newest', 'oldest', 'amount-desc', 'amount-asc', 'guest'] as const;
type Filters = { resource: HistoryResource; from: string; to: string; q: string; service: string; method: string; status: string; sort: HistorySort; customer: string };
type CursorRow = HistoryRow & { _key: number | string };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function dayOffset(day: string, count: number) {
  const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const utcStart = (day: string) => new Date(day + 'T00:00:00+05:30').toISOString();
const serviceDate = (path: string) => ({ $dateToString: { date: { $toDate: path }, format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } });

function filters(params: URLSearchParams, user: WorkspaceUser): Filters {
  const today = serviceDay();
  const value = {
    resource: params.get('resource') || 'bills', from: params.get('from') || (user.role === 'Staff' ? today : today.slice(0, 8) + '01'),
    to: params.get('to') || today, q: (params.get('q') || '').trim(), service: params.get('service') || 'all',
    method: params.get('method') || 'all', status: params.get('status') || 'all', sort: params.get('sort') || 'newest', customer: params.get('customer') || '',
  };
  if (!resources.includes(value.resource as HistoryResource) || !sorts.includes(value.sort as HistorySort)) throw new ApiError(400, 'Choose a valid report and sort order.');
  if (user.role !== 'Owner' && value.resource !== 'bills') throw new ApiError(403, 'Owner access is required for reports.');
  if (!validDay(value.from) || !validDay(value.to) || value.from > value.to) throw new ApiError(400, 'Choose a valid start date on or before the end date.');
  if (Date.parse(value.to) - Date.parse(value.from) > 365 * 86_400_000) throw new ApiError(400, 'Choose up to 366 days at a time.');
  if (user.role === 'Staff' && (value.from !== today || value.to !== today)) throw new ApiError(403, 'Staff bill history is limited to today. Ask the owner for older bills.');
  if (value.q.length > 80 || !['all', 'Dine-in', 'Parcel'].includes(value.service) || !['all', 'Cash', 'UPI', 'Card'].includes(value.method) ||
    !['all', 'Paid', 'Part refunded', 'Refunded', 'Cancelled', 'Voided'].includes(value.status)) throw new ApiError(400, 'Check the search and filters.');
  if (value.resource === 'activity') { value.method = 'all'; if (!['newest', 'oldest'].includes(value.sort)) throw new ApiError(400, 'Sort activity by time.'); }
  if (value.customer && (!/^[a-z\d-]{1,100}$/i.test(value.customer) || !['bills', 'sales'].includes(value.resource))) throw new ApiError(400, 'Choose a valid customer in bill history.');
  return value as Filters;
}

/** Math.round(nonnegative paise) uses half-up rounding. MongoDB $round uses
 * bankers rounding, so use floor(x + .5) to match the shared billing domain. */
function financialStages(): PipelineStage[] {
  return [
    { $set: { _subtotal: { $sum: { $map: { input: '$payload.order.items', as: 'line', in: { $multiply: ['$$line.price', '$$line.quantity'] } } } } } },
    { $set: { _saving: { $cond: [{ $and: [{ $eq: ['$payload.order.discount.pending', false] }, { $eq: ['$payload.order.discount.subtotal', '$_subtotal'] }] },
      { $cond: [{ $eq: ['$payload.order.discount.kind', 'percent'] }, { $floor: { $add: [{ $divide: [{ $multiply: ['$_subtotal', '$payload.order.discount.value'] }, 100] }, 0.5] } }, '$payload.order.discount.value'] }, 0] } } },
    { $set: { _net: { $subtract: ['$_subtotal', '$_saving'] }, _tip: { $ifNull: ['$payload.order.tip', 0] } } },
    { $set: { _tax: { $floor: { $add: [{ $divide: [{ $multiply: ['$_net', '$payload.taxRate'] }, 100] }, 0.5] } } } },
    { $set: { _sales: { $add: ['$_net', { $multiply: ['$_tax', 2] }] } } },
    { $set: { _total: { $add: ['$_sales', '$_tip'] } } },
  ];
}
function billBase(value: Filters, withStatus = true, preview = false): PipelineStage[] {
  const match: Record<string, unknown> = value.from ? { date: { $gte: value.from, $lte: value.to } } : {};
  if (value.resource === 'sales') match['payload.voided'] = { $ne: true };
  if (value.service !== 'all') match['payload.order.kind'] = value.service === 'Dine-in' ? { $in: ['Dine-in', null] } : value.service;
  if (value.method !== 'all') match.$or = [{ 'payload.payments.method': value.method }, { 'payload.order.advance.method': value.method }];
  if (value.q) match.$and = [{ $or: [{ _id: { $regex: escapeRegex(value.q), $options: 'i' } }, { 'payload.order.guest': { $regex: escapeRegex(value.q), $options: 'i' } }] }];
  const pipeline: PipelineStage[] = [{ $match: match }];
  if (preview) {
    pipeline[0] = { $match: { ...match, 'payload.order.guestId': value.customer } };
    pipeline.push({ $unionWith: { coll: OrderModel.collection.name, pipeline: [
      { $match: { 'payload.guestId': value.customer, status: 'Billed' } },
      { $lookup: { from: InvoiceModel.collection.name, localField: '_id', foreignField: 'orderId',
        pipeline: [{ $match: { ...match, 'payload.order.guestId': { $in: ['', null] } } }], as: 'invoice' } },
      { $unwind: '$invoice' },
      { $replaceWith: '$invoice' },
    ] } }, { $sort: { date: -1, _id: -1 } }, { $limit: 5 });
  } else if (value.customer) pipeline.push(
    { $lookup: { from: OrderModel.collection.name, localField: 'orderId', foreignField: '_id',
      pipeline: [{ $match: { 'payload.guestId': value.customer } }, { $project: { _id: 1 } }], as: '_customerOrders' } },
    { $match: { $or: [{ 'payload.order.guestId': value.customer }, { '_customerOrders.0': { $exists: true } }] } },
  );
  pipeline.push(...financialStages());
  if (withStatus) pipeline.push(
    { $lookup: { from: RefundModel.collection.name, localField: '_id', foreignField: 'billId', pipeline: [
      { $group: { _id: null, amount: { $sum: '$payload.amount' }, cancelled: { $max: '$payload.cancelled' } } },
    ], as: '_refunds' } },
    { $set: { _returned: { $ifNull: [{ $arrayElemAt: ['$_refunds.amount', 0] }, 0] }, _cancelled: { $ifNull: [{ $arrayElemAt: ['$_refunds.cancelled', 0] }, false] } } },
    { $set: { _status: { $switch: { branches: [
      { case: { $eq: ['$payload.voided', true] }, then: 'Voided' }, { case: '$_cancelled', then: 'Cancelled' },
      { case: { $and: [{ $gt: ['$_returned', 0] }, { $gte: ['$_returned', '$_total'] }] }, then: 'Refunded' },
      { case: { $gt: ['$_returned', 0] }, then: 'Part refunded' },
    ], default: 'Paid' } } } },
  );
  if (withStatus && value.status !== 'all') pipeline.push({ $match: { _status: value.status } });
  return pipeline;
}
function pipelineFor(value: Filters, preview = false): PipelineStage[] {
  let pipeline: PipelineStage[];
  if (value.resource === 'bills' || value.resource === 'sales') {
    pipeline = [...billBase(value, true, preview), { $project: { _id: 0, id: '$_id', billId: '$_id', orderId: '$orderId', date: 1, time: '$payload.time',
      guest: { $ifNull: ['$payload.order.guest', ''] }, kind: { $ifNull: ['$payload.order.kind', 'Dine-in'] },
      total: '$_total', sales: { $cond: [{ $eq: ['$_status', 'Voided'] }, 0, '$_sales'] },
      gst: { $cond: [{ $eq: ['$_status', 'Voided'] }, 0, { $multiply: ['$_tax', 2] }] },
      tip: { $cond: [{ $eq: ['$_status', 'Voided'] }, 0, '$_tip'] }, status: '$_status' } }];
  } else if (value.resource === 'refunds') {
    pipeline = [
      { $match: { 'payload.at': { $gte: utcStart(value.from), $lt: utcStart(dayOffset(value.to, 1)) }, ...(value.method !== 'all' ? { 'payload.method': value.method } : {}) } },
      { $lookup: { from: InvoiceModel.collection.name, localField: 'billId', foreignField: '_id', pipeline: [
        { $project: { _id: 0, guest: '$payload.order.guest', kind: '$payload.order.kind' } },
      ], as: '_invoice' } },
      { $project: { _id: 0, id: '$_id', billId: 1, at: '$payload.at', date: serviceDate('$payload.at'),
        guest: { $ifNull: [{ $arrayElemAt: ['$_invoice.guest', 0] }, ''] }, kind: { $ifNull: [{ $arrayElemAt: ['$_invoice.kind', 0] }, 'Dine-in'] },
        amount: '$payload.amount', salesAmount: '$payload.salesAmount', taxAmount: '$payload.taxAmount', tipAmount: '$payload.tipAmount',
        method: '$payload.method', reason: '$payload.reason', cancelled: '$payload.cancelled', actor: '$payload.actor' } },
    ];
  } else if (value.resource === 'activity') {
    const range = { $gte: utcStart(value.from), $lt: utcStart(dayOffset(value.to, 1)) };
    pipeline = [
      { $match: { 'payload.events.at': range } }, { $unwind: '$payload.events' }, { $match: { 'payload.events.at': range } },
      { $project: { _id: 0, id: '$payload.events.id', orderId: '$_id', date: serviceDate('$payload.events.at'), at: '$payload.events.at',
        guest: { $ifNull: ['$payload.guest', ''] }, kind: { $ifNull: ['$payload.kind', 'Dine-in'] }, actor: '$payload.events.actor', action: '$payload.events.action', detail: '$payload.events.detail' } },
    ];
  } else {
    const range = { $gte: value.from, $lte: value.to };
    pipeline = [
      { $match: { $or: [{ 'payload.payments.date': range }, { 'payload.advance.date': range }] } },
      { $set: { _payments: { $concatArrays: [
        { $cond: [{ $gt: ['$payload.advance.amount', 0] }, [{ amount: '$payload.advance.amount', method: '$payload.advance.method', date: '$payload.advance.date', type: 'Advance' }], []] },
        { $map: { input: { $ifNull: ['$payload.payments', []] }, as: 'payment', in: { amount: '$$payment.amount', method: '$$payment.method', date: '$$payment.date', type: 'Payment' } } },
      ] } } },
      { $unwind: { path: '$_payments', includeArrayIndex: '_paymentIndex' } },
      { $match: { '_payments.date': range, ...(value.method !== 'all' ? { '_payments.method': value.method } : {}) } },
      { $lookup: { from: InvoiceModel.collection.name, localField: '_id', foreignField: 'orderId', pipeline: [{ $project: { _id: 1 } }], as: '_invoice' } },
      { $project: { _id: 0, id: { $concat: ['$_id', '-', { $toString: '$_paymentIndex' }] }, orderId: '$_id', billId: { $arrayElemAt: ['$_invoice._id', 0] },
        date: '$_payments.date', guest: { $ifNull: ['$payload.guest', ''] }, kind: { $ifNull: ['$payload.kind', 'Dine-in'] },
        amount: '$_payments.amount', method: '$_payments.method', paymentType: '$_payments.type' } },
    ];
  }
  if (!['bills', 'sales'].includes(value.resource)) {
    if (value.service !== 'all') pipeline.push({ $match: { kind: value.service } });
    if (value.q) pipeline.push({ $match: { $or: ['id', 'billId', 'orderId', 'guest', 'actor', 'action', 'detail', 'reason'].map(field => ({ [field]: { $regex: escapeRegex(value.q), $options: 'i' } })) } });
  }
  const key = value.sort.startsWith('amount') ? { $ifNull: ['$total', { $ifNull: ['$amount', 0] }] } : value.sort === 'guest' ? { $toLower: '$guest' } : { $ifNull: ['$at', '$date'] };
  pipeline.push({ $set: { _key: key } });
  return pipeline;
}
function modelFor(resource: HistoryResource) {
  return resource === 'bills' || resource === 'sales' ? InvoiceModel : resource === 'refunds' ? RefundModel : OrderModel;
}
const fingerprint = (value: Filters) => createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 22);
function encode(row: CursorRow, value: Filters) { return Buffer.from(JSON.stringify({ key: row._key, id: row.id, filter: fingerprint(value) })).toString('base64url'); }
function seek(params: URLSearchParams, value: Filters) {
  const token = params.get('after') || params.get('before');
  if (params.has('after') && params.has('before')) throw new ApiError(400, 'Choose one page direction.');
  const direction = value.sort === 'newest' || value.sort === 'amount-desc' ? -1 : 1;
  const before = Boolean(params.get('before'));
  let match: PipelineStage.FacetPipelineStage[] = [];
  if (token) {
    try {
      if (token.length > 1500) throw new Error();
      const data = JSON.parse(Buffer.from(token, 'base64url').toString());
      const numeric = value.sort.startsWith('amount');
      if (data.filter !== fingerprint(value) || typeof data.id !== 'string' || data.id.length > 200 ||
        (numeric ? typeof data.key !== 'number' || !Number.isSafeInteger(data.key) : typeof data.key !== 'string' || data.key.length > 2000)) throw new Error();
      const comparison = direction * (before ? -1 : 1) === 1 ? '$gt' : '$lt';
      match = [{ $match: { $or: [{ _key: { [comparison]: data.key } }, { _key: data.key, id: { [comparison]: data.id } }] } }];
    } catch { throw new ApiError(400, 'This page link is no longer valid for these filters. Start from the first page.'); }
  }
  return { match, direction: direction * (before ? -1 : 1) as 1 | -1, before, token };
}
export async function historyPage(params: URLSearchParams, user: WorkspaceUser): Promise<HistoryResponse> {
  const value = filters(params, user), paging = seek(params, value);
  const pipeline = pipelineFor(value);
  if (value.resource === 'activity' && params.get('recent') === '1') {
    const limit = 10;
    const found = await OrderModel.aggregate<CursorRow>([...pipeline, ...paging.match,
      { $sort: { _key: paging.direction, id: paging.direction } }, { $limit: limit + 1 },
    ]).option({ maxTimeMS: 15000, allowDiskUse: true });
    const more = found.length > limit;
    const rows = found.slice(0, limit);
    if (paging.before) rows.reverse();
    return { items: rows.map(({ _key, ...row }) => row), total: rows.length, pageSize: limit,
      next: rows.length && (paging.before ? Boolean(paging.token) : more) ? encode(rows.at(-1)!, value) : null,
      previous: rows.length && (paging.before ? more : Boolean(paging.token)) ? encode(rows[0], value) : null,
      summary: { sales: 0, gst: 0, tips: 0, amount: 0, salesAmount: 0, taxAmount: 0, tipAmount: 0 }, generatedAt: new Date().toISOString() };
  }
  const result = await modelFor(value.resource).aggregate<{ items: CursorRow[]; summary: ({ total: number } & HistoryResponse['summary'])[] }>([
    ...pipeline, { $facet: {
      items: [...paging.match, { $sort: { _key: paging.direction, id: paging.direction } }, { $limit: pageSize + 1 }],
      summary: [{ $group: { _id: null, total: { $sum: 1 }, sales: { $sum: { $cond: [{ $eq: ['$status', 'Voided'] }, 0, { $ifNull: ['$sales', 0] }] } }, gst: { $sum: { $cond: [{ $eq: ['$status', 'Voided'] }, 0, { $ifNull: ['$gst', 0] }] } },
        tips: { $sum: { $cond: [{ $eq: ['$status', 'Voided'] }, 0, { $ifNull: ['$tip', 0] }] } }, amount: { $sum: { $ifNull: ['$amount', 0] } }, salesAmount: { $sum: { $ifNull: ['$salesAmount', 0] } },
        taxAmount: { $sum: { $ifNull: ['$taxAmount', 0] } }, tipAmount: { $sum: { $ifNull: ['$tipAmount', 0] } } } }],
    } },
  ]).option({ maxTimeMS: 15000, allowDiskUse: true });
  const more = (result[0]?.items.length ?? 0) > pageSize;
  const rows = (result[0]?.items ?? []).slice(0, pageSize);
  if (paging.before) rows.reverse();
  const summary = result[0]?.summary[0];
  return { items: rows.map(({ _key, ...row }) => row), total: summary?.total ?? 0, pageSize,
    next: rows.length && (paging.before ? Boolean(paging.token) : more) ? encode(rows.at(-1)!, value) : null,
    previous: rows.length && (paging.before ? more : Boolean(paging.token)) ? encode(rows[0], value) : null,
    summary: { sales: summary?.sales ?? 0, gst: summary?.gst ?? 0, tips: summary?.tips ?? 0, amount: summary?.amount ?? 0,
      salesAmount: summary?.salesAmount ?? 0, taxAmount: summary?.taxAmount ?? 0, tipAmount: summary?.tipAmount ?? 0 }, generatedAt: new Date().toISOString() };
}

export async function recentCustomerBills(customer: string, user: WorkspaceUser) {
  const value = filters(new URLSearchParams({ customer }), user);
  if (user.role === 'Owner') value.from = '';
  return InvoiceModel.aggregate<HistoryRow>(pipelineFor(value, true)).option({ maxTimeMS: 5000 });
}

export async function invoiceDetail(id: string, user: WorkspaceUser) {
  if (!id || id.length > 100) throw new ApiError(400, 'Choose a bill.');
  const record = await InvoiceModel.findById(id).lean();
  if (!record) throw new ApiError(404, 'Bill not found.');
  const order = await OrderModel.findById(record.orderId).select('payload').lean();
  if (user.role !== 'Owner' && record.date !== serviceDay() && (!order || !occupiesTable(order.payload as Visit))) throw new ApiError(403, 'Only the owner can open historical bills.');
  const refunds = await RefundModel.find({ billId: id }).select('payload').sort({ createdAt: 1 }).lean();
  return { bill: record.payload as Bill, order: order?.payload as Visit | undefined, refunds: refunds.map(row => row.payload) };
}
export async function orderDetail(id: string, user: WorkspaceUser) {
  if (!id || id.length > 100) throw new ApiError(400, 'Choose an order.');
  const row = await OrderModel.findById(id).select('payload').lean();
  if (!row) throw new ApiError(404, 'Order not found.');
  const order = row.payload as Visit;
  if (user.role !== 'Owner' && !['Draft', 'Open', 'Upcoming'].includes(order.status) && !occupiesTable(order) && order.date !== serviceDay()) {
    const bill = await InvoiceModel.exists({ orderId: id, date: serviceDay() });
    if (!bill) throw new ApiError(403, 'Only the owner can open historical orders.');
  }
  return { order, billId: (await InvoiceModel.findOne({ orderId: id }).select('_id').lean())?._id };
}

export async function overview(params: URLSearchParams, user: WorkspaceUser): Promise<OverviewResponse> {
  const today = serviceDay(), days = params.get('days') || '7';
  if (!['7', '14'].includes(days)) throw new ApiError(400, 'Choose a 7 or 14 day overview.');
  const from = dayOffset(today, 1 - Number(days));
  const base = (start: string): Filters => ({ resource: 'sales', from: start, to: today, q: '', service: 'all', method: 'all', status: 'all', sort: 'newest', customer: '' });
  const activeMatch = { status: 'Open', 'payload.guestLeftAt': { $in: [null, ''] } };
  async function recentBills() {
    const filter = { date: { $gte: user.role === 'Staff' ? today : dayOffset(today, -365), $lte: today } };
    const ids = (await InvoiceModel.find(filter).select('_id').sort({ date: -1, _id: -1 }).limit(4).lean()).map(row => row._id);
    if (!ids.length) return [];
    return InvoiceModel.aggregate<HistoryRow>([{ $match: { _id: { $in: ids } } }, ...billBase({ ...base(dayOffset(today, -365)), resource: 'bills' }),
      { $sort: { date: -1, _id: -1 } }, { $project: { _id: 0, id: '$_id', date: 1, time: '$payload.time', guest: '$payload.order.guest',
        kind: { $ifNull: ['$payload.order.kind', 'Dine-in'] }, status: '$_status', total: '$_total', sales: '$_sales', gst: { $multiply: ['$_tax', 2] }, tip: '$_tip' } }]);
  }
  const [daily, active, upcomingCount, recentRecords, financial, returned, top] = await Promise.all([
    InvoiceModel.aggregate<{ count: number; guests: number }>([{ $match: { date: today, 'payload.voided': { $ne: true } } }, { $group: { _id: null, count: { $sum: 1 }, guests: { $sum: {
      $cond: [{ $eq: ['$payload.order.kind', 'Parcel'] }, 0, { $add: ['$payload.order.covers', { $ifNull: ['$payload.order.extraCovers', 0] }] }] } } } }]),
    OrderModel.aggregate<{ count: number; guests: number }>([{ $match: activeMatch }, { $group: { _id: null, count: { $sum: 1 }, guests: { $sum: {
      $cond: [{ $and: [{ $ne: ['$payload.kind', 'Parcel'] }, { $eq: ['$payload.date', today] }] }, { $add: ['$payload.covers', { $ifNull: ['$payload.extraCovers', 0] }] }, 0] } } } }]),
    OrderModel.countDocuments({ status: 'Upcoming' }),
    recentBills(),
    user.role === 'Owner' ? InvoiceModel.aggregate<{ _id: string; sales: number; tips: number; count: number; dineIn: number; parcel: number }>([
      ...billBase(base(from), false), { $group: { _id: '$date', sales: { $sum: '$_sales' }, tips: { $sum: '$_tip' }, count: { $sum: 1 },
        dineIn: { $sum: { $cond: [{ $ne: ['$payload.order.kind', 'Parcel'] }, 1, 0] } }, parcel: { $sum: { $cond: [{ $eq: ['$payload.order.kind', 'Parcel'] }, 1, 0] } } } },
    ]) : Promise.resolve([]),
    user.role === 'Owner' ? RefundModel.aggregate<{ sales: number }>([{ $match: { 'payload.at': { $gte: utcStart(today), $lt: utcStart(dayOffset(today, 1)) } } },
      { $group: { _id: null, sales: { $sum: '$payload.salesAmount' } } }]) : Promise.resolve([]),
    user.role === 'Owner' ? InvoiceModel.aggregate<{ name: string; quantity: number }>([{ $match: { date: today, 'payload.voided': { $ne: true } } },
      { $unwind: '$payload.order.items' }, { $group: { _id: '$payload.order.items.name', quantity: { $sum: '$payload.order.items.quantity' } } },
      { $sort: { quantity: -1, _id: 1 } }, { $limit: 5 }, { $project: { _id: 0, name: '$_id', quantity: 1 } }]) : Promise.resolve([]),
  ]);
  const day = financial.find(row => row._id === today), sales = day?.sales ?? 0, returnedSales = returned[0]?.sales ?? 0;
  return { today, activeCount: active[0]?.count ?? 0, upcomingCount, billsToday: daily[0]?.count ?? 0, guests: (daily[0]?.guests ?? 0) + (active[0]?.guests ?? 0),
    ...(user.role === 'Owner' ? { sales, returnedSales, netSales: sales - returnedSales, tips: day?.tips ?? 0, averageBill: day?.count ? Math.round(sales / day.count) : 0,
      dineIn: day?.dineIn ?? 0, parcel: day?.parcel ?? 0 } : {}),
    trend: user.role === 'Owner' ? Array.from({ length: Number(days) }, (_, index) => { const day = dayOffset(from, index); return { day, amount: financial.find(row => row._id === day)?.sales ?? 0 }; }) : [],
    topDishes: top, recent: recentRecords };
}

function csvColumns(resource: HistoryResource) {
  if (resource === 'activity') return { header: ['Order', 'Service date (IST)', 'Time (UTC)', 'Staff', 'Action', 'Details'], row: (value: HistoryRow) => [value.orderId, value.date, value.at, value.actor, value.action, value.detail] };
  if (resource === 'refunds') return { header: ['Reference', 'Bill', 'Service date (IST)', 'Time (UTC)', 'Amount returned (INR)', 'Sales reduction (INR)', 'GST portion (INR)', 'Tip returned (INR)', 'Method', 'Reason', 'By', 'Cancelled'],
    row: (value: HistoryRow) => [value.id, value.billId, value.date, value.at, (value.amount ?? 0) / 100, (value.salesAmount ?? 0) / 100, (value.taxAmount ?? 0) / 100, (value.tipAmount ?? 0) / 100, value.method, value.reason, value.actor, value.cancelled] };
  if (resource === 'payments') return { header: ['Order', 'Bill', 'Date', 'Guest', 'Service', 'Entry', 'Method', 'Amount (INR)'], row: (value: HistoryRow) => [value.orderId, value.billId, value.date, value.guest, value.kind, value.paymentType, value.method, (value.amount ?? 0) / 100] };
  return { header: ['Bill', 'Date', 'Guest', 'Service', 'Status', 'Sales including GST (INR)', 'GST (INR)', 'Tip (INR)', 'Total charged (INR)'],
    row: (value: HistoryRow) => [value.id, value.date, value.guest, value.kind, value.status, (value.sales ?? 0) / 100, (value.gst ?? 0) / 100, (value.tip ?? 0) / 100, (value.total ?? 0) / 100] };
}
export async function exportHistory(params: URLSearchParams, user: WorkspaceUser, signal: AbortSignal) {
  const value = filters(params, user), direction = value.sort === 'newest' || value.sort === 'amount-desc' ? -1 : 1;
  const cursor = modelFor(value.resource).aggregate<CursorRow>([...pipelineFor(value), { $sort: { _key: direction, id: direction } }])
    .option({ maxTimeMS: 45000, allowDiskUse: true }).cursor({ batchSize: 100 });
  const iterator = cursor[Symbol.asyncIterator]();
  let first: Awaited<ReturnType<typeof iterator.next>>;
  try { first = await iterator.next(); } catch (error) { await cursor.close(); throw error; }
  const columns = csvColumns(value.resource);
  async function* rows() {
    try {
      let pending = first;
      while (!pending.done) {
        yield columns.row(pending.value);
        pending = await iterator.next();
      }
    } finally { await cursor.close(); }
  }
  const filename = 'Sweet-Rascal-' + value.resource + '-' + value.from + '-' + value.to;
  if (params.get('format') === 'xlsx') return xlsxResponse(filename, columns.header, rows(), signal);
  return csvResponse(filename, columns.header, rows(), signal);
}
