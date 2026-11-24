import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError, applicationOrigin, checkOrigin, checkPassword, currentUser, hashPassword, requireUser, sessionCookie, sessionLifetime, tokenHash } from '../../../../lib/server/auth';
import { connectDatabase, databaseConfigured } from '../../../../lib/server/database';
import { AttemptModel, AuditModel, BusinessModel, CustomerModel, InvoiceModel, SessionModel, UserModel, ensureIndexes } from '../../../../lib/server/models';
import { businessInput, customerInput } from '../../../../lib/server/validation';
import { initialData, returningVisitFields, serviceDay, type Visit } from '../../../../lib/demo';
import { linkBilledCustomer, loadOperations, operationsVersion, orderCommand, refundCommand, saveCatalog } from '../../../../lib/server/operations';
import { exportHistory, historyPage, invoiceDetail, orderDetail, overview, recentCustomerBills } from '../../../../lib/server/history';
import { csvResponse, xlsxResponse } from '../../../../lib/server/tabular-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ action?: string[] }> };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const cookieOptions = () => ({ httpOnly: true, secure: applicationOrigin().startsWith('https:'), sameSite: 'lax' as const, path: '/' });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function customerSearch(query: string) {
  const byPhone = /^\+?\d[\d\s()-]*$/.test(query);
  const sortKey: 'phone' | 'nameKey' = byPhone ? 'phone' : 'nameKey';
  const filter = query ? byPhone
    ? { phone: { $regex: '^' + escapeRegex(query.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')) } }
    : { nameKey: { $regex: '^' + escapeRegex(query.toLocaleLowerCase('en-IN')) } } : {};
  return { sortKey, filter };
}
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ message: error.message }, error.status);
  if (error instanceof ZodError) return json({ message: error.issues[0]?.message || 'Check the form.' }, 400);
  if (error instanceof SyntaxError) return json({ message: 'Invalid request data.' }, 400);
  if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return json({ message: 'This record already exists. Refresh and try again.' }, 409);
  if (typeof error === 'object' && error && 'code' in error && error.code === 50) return json({ message: 'This range took too long to load. Choose a shorter date range and retry.' }, 503);
  return json({ message: 'Could not save or load the data. Check the database connection and retry.' }, 503);
}
async function body(request: NextRequest) {
  const text = await request.text();
    if (text.length > 524_288) throw new ApiError(413, 'This form is too large.');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid form data.');
  return value;
}
function customerDto(value: Record<string, unknown>, owner: boolean, compact = false) {
  return {
    id: value._id, name: value.name, phone: value.phone, assigned: value.assigned, sync: value.sync, revision: value.revision,
    notes: owner && !compact ? value.notes : '', contactNote: compact ? '' : value.contactNote,
    companions: compact ? [] : value.companions, syncIssue: value.syncIssue, syncConfirmedAt: value.syncConfirmedAt,
  };
}
async function business() {
  return BusinessModel.findByIdAndUpdate('restaurant', {
    $setOnInsert: { ...initialData.business, _id: 'restaurant', contactSync: false, changedBy: 'setup', revision: 0 },
  }, { upsert: true, returnDocument: 'after' }).lean();
}
function businessDto(value: NonNullable<Awaited<ReturnType<typeof business>>>) {
  return { name: value.name, address: value.address, phone: value.phone, gstin: value.gstin, footer: value.footer,
    taxRate: value.taxRate, contactSync: value.contactSync, staffDiscountLimit: value.staffDiscountLimit, revision: value.revision };
}

export async function GET(request: NextRequest, context: Context) {
  const [action, id] = (await context.params).action ?? [];
  try {
    if (action === 'session') {
      if (!databaseConfigured()) return json({ configured: false, user: null });
      return json({ configured: true, user: await currentUser() });
    }
    const user = await requireUser(action === 'users' || action === 'audit' || action === 'customer-export');
    if (action === 'customer-export') {
      const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 80) ?? '';
      const { filter, sortKey } = customerSearch(query);
      async function* rows() {
        const cursor = CustomerModel.find(filter).select('_id name phone contactNote companions sync').sort({ [sortKey]: 1, _id: 1 }).lean().cursor({ batchSize: 100 });
        try {
          for await (const guest of cursor) {
            yield [guest._id, guest.name, guest.phone, guest.contactNote, guest.companions?.map(person => `${person.name} (${person.phone})`).join('; '), guest.sync];
          }
        } finally { await cursor.close(); }
      }
      const headers = ['Customer ID', 'Name', 'Phone', 'Contact note', 'Additional contacts', 'Contact sync'];
      const filename = 'Sweet-Rascal-customers-' + serviceDay();
      return request.nextUrl.searchParams.get('format') === 'xlsx'
        ? await xlsxResponse(filename, headers, rows(), request.signal)
        : csvResponse(filename, headers, rows(), request.signal);
    }
    if (action === 'customer-prefill' && id) {
      if (id.length > 100) throw new ApiError(400, 'Choose a valid customer.');
      const last = await InvoiceModel.findOne({ 'payload.order.guestId': id, 'payload.voided': { $ne: true } })
        .select(returningVisitFields.map(field => `payload.order.${field}`).join(' ')).sort({ date: -1, _id: -1 }).lean();
      const visit = last?.payload?.order as Visit | undefined;
      return json({ preferences: Object.fromEntries(returningVisitFields.filter(field => visit?.[field]).map(field => [field, visit?.[field]])) });
    }
    if (action === 'history') return json(await historyPage(request.nextUrl.searchParams, user));
    if (action === 'customer-bills' && id) return json({ items: await recentCustomerBills(id, user) });
    if (action === 'export') return await exportHistory(request.nextUrl.searchParams, user, request.signal);
    if (action === 'overview') return json(await overview(request.nextUrl.searchParams, user));
    if (action === 'invoice') return json(await invoiceDetail(request.nextUrl.searchParams.get('id') || '', user));
    if (action === 'order') return json(await orderDetail(request.nextUrl.searchParams.get('id') || '', user));
    if (action === 'operations') {
      const since = request.nextUrl.searchParams.get('since');
      const version = since === null ? undefined : await operationsVersion();
      if (version !== undefined && version === since) return json({ unchanged: true });
      return json(await loadOperations(user, version));
    }
    if (action === 'business') {
      const settings = await business();
      return json({ business: businessDto(settings!) });
    }
    if (action === 'users') {
      const users = await UserModel.find().select('_id name email role active').sort({ name: 1 }).limit(100).lean();
      return json({ users: users.map(value => ({ id: value._id, name: value.name, email: value.email, role: value.role, active: value.active })) });
    }
    if (action === 'audit') {
      const events = await AuditModel.find().sort({ at: -1, _id: -1 }).limit(50).lean();
      return json({ events: events.map(value => ({ id: String(value._id), at: value.at, actor: value.actor, action: value.action, detail: value.detail })) });
    }
    if (action === 'customers' && id) {
      const customer = await CustomerModel.findById(id).lean();
      if (!customer) throw new ApiError(404, 'Customer not found.');
      return json({ customer: customerDto(customer, user.role === 'Owner') });
    }
    if (action === 'customers') {
      const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 80) || '';
      if (request.nextUrl.searchParams.get('picker') === '1' && query.length < 2) return json({ items: [], next: null });
      const { sortKey, filter } = customerSearch(query);
      const cursor = request.nextUrl.searchParams.get('cursor');
      let after = {};
      if (cursor) {
        if (cursor.length > 1000) throw new ApiError(400, 'Invalid page. Start the search again.');
        const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
        if (typeof value.value !== 'string' || typeof value.id !== 'string' || value.query !== query) throw new ApiError(400, 'Invalid page.');
        after = { $or: [{ [sortKey]: { $gt: value.value } }, { [sortKey]: value.value, _id: { $gt: value.id } }] };
      }
      const customers = await CustomerModel.find({ $and: [filter, after] })
        .select('_id name nameKey phone assigned sync revision syncIssue syncConfirmedAt').sort({ [sortKey]: 1, _id: 1 }).limit(11).lean();
      const rows = customers.slice(0, 10), last = rows.at(-1);
      return json({ items: rows.map(value => customerDto(value, false, true)),
        next: customers.length > 10 && last ? Buffer.from(JSON.stringify({ value: last[sortKey], id: last._id, query })).toString('base64url') : null });
    }
    return json({ message: 'Not found.' }, 404);
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, context: Context) {
  const [action] = (await context.params).action ?? [];
  try {
    checkOrigin(request);
    if (!databaseConfigured()) throw new ApiError(503, 'Add MONGODB_URI to enable the connected workspace.');
    await connectDatabase();
    if (action === 'login') {
      const input = await body(request);
      if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.email.length > 254 || input.password.length > 256) throw new ApiError(400, 'Enter your email and password.');
      const email = input.email.trim().toLowerCase();
      const window = Math.floor(Date.now() / 900_000);
      const attempt = await AttemptModel.findByIdAndUpdate(tokenHash(email) + '-' + window, {
        $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * 900_000) },
      }, { upsert: true, returnDocument: 'after' }).lean();
      if (attempt!.count > 10) throw new ApiError(429, 'Too many attempts. Try again in 15 minutes.');
      if (process.env.OWNER_EMAIL?.trim().toLowerCase() === email && !await UserModel.exists({ _id: 'initial-owner' })) {
        const password = process.env.OWNER_PASSWORD;
        if (!password || password.length < 12 || input.password !== password) throw new ApiError(401, 'Email or password was not accepted.');
        await ensureIndexes();
        await UserModel.updateOne({ _id: 'initial-owner' }, { $setOnInsert: {
          name: process.env.OWNER_NAME?.trim() || 'Owner', email, passwordHash: await hashPassword(password), role: 'Owner', active: true,
        } }, { upsert: true });
      }
      const user = await UserModel.findOne({ email, active: true }).select('+passwordHash').lean();
      const dummy = '0'.repeat(32) + '.' + '0'.repeat(128);
      const valid = await checkPassword(input.password, user?.passwordHash || dummy);
      if (!user || !valid) throw new ApiError(401, 'Email or password was not accepted.');
      const raw = randomBytes(32).toString('hex');
      await SessionModel.create({ _id: tokenHash(raw), userId: user._id, expiresAt: new Date(Date.now() + sessionLifetime * 1000) });
      const response = json({ ok: true });
      response.cookies.set(sessionCookie, raw, { ...cookieOptions(), maxAge: sessionLifetime });
      return response;
    }
    if (action === 'logout') {
      const raw = request.cookies.get(sessionCookie)?.value;
      if (raw) await SessionModel.deleteOne({ _id: tokenHash(raw) });
      const response = json({ ok: true });
      response.cookies.set(sessionCookie, '', { ...cookieOptions(), maxAge: 0 });
      return response;
    }
    const user = await requireUser(action === 'business' || action === 'users' || action === 'link-billed-customer');
    const input = await body(request);
    if (action === 'link-billed-customer') return json(await linkBilledCustomer(input, user));
    if (action === 'catalog') return json(await saveCatalog(input, user));
    if (action === 'orders') return json(await orderCommand(input, user));
    if (action === 'refunds') return json(await refundCommand(input, user));
    if (action === 'profile') {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new ApiError(400, 'Enter a name of up to 120 characters.');
      await UserModel.updateOne({ _id: user.id }, { $set: { name: input.name.trim() } });
      return json({ name: input.name.trim() });
    }
    if (action === 'users') {
      if (input.id) {
        if (typeof input.id !== 'string' || typeof input.active !== 'boolean' || input.id === user.id) throw new ApiError(400, 'Choose another staff account to change access.');
        const updated = await UserModel.updateOne({ _id: input.id }, { $set: { active: input.active } });
        if (!updated.matchedCount) throw new ApiError(404, 'Staff account not found.');
        if (!input.active) await SessionModel.deleteMany({ userId: input.id });
      } else {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 ||
          typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254 ||
          typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new ApiError(400, 'Enter a name, email and password of at least 12 characters.');
        await UserModel.create({ _id: randomUUID(), name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: await hashPassword(input.password), role: 'Staff', active: true });
      }
      return json({ ok: true });
    }
    if (action === 'customers') {
      const value = customerInput.parse(input);
      const previous = await CustomerModel.findById(value.id).lean();
      if (previous && value.revision !== previous.revision) throw new ApiError(409, 'Someone updated this customer. Open their record again before saving.');
      if (value.phone && !value.shared && await CustomerModel.exists({ _id: { $ne: value.id }, phone: value.phone })) throw new ApiError(409, 'That phone is already saved. Confirm that the number is shared.');
      const sync: 'Sync pending' | 'No phone' = value.phone || value.companions.some(person => person.saveToGoogle) ? 'Sync pending' : 'No phone';
      const fields = { name: value.name, nameKey: value.name.toLocaleLowerCase('en-IN'), phone: value.phone,
        contactNote: value.contactNote, companions: value.companions, notes: user.role === 'Owner' ? value.notes : previous?.notes || '',
        assigned: previous?.assigned || user.role, changedBy: user.id, sync };
      let saved;
      if (previous) {
        saved = await CustomerModel.findOneAndUpdate({ _id: value.id, revision: value.revision }, {
          $set: fields, $inc: { revision: 1 }, $unset: { syncConfirmedAt: 1, syncIssue: 1 },
        }, { returnDocument: 'after', runValidators: true }).lean();
        if (!saved) throw new ApiError(409, 'Someone updated this customer. Refresh and try again.');
      } else saved = (await CustomerModel.create({ _id: value.id, ...fields })).toObject();
      return json({ customer: customerDto(saved!, user.role === 'Owner') });
    }
    if (action === 'business') {
      const value = businessInput.parse(input);
      if (value.taxRate > 0 && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(value.gstin)) throw new ApiError(400, 'Enter a valid 15-character GSTIN.');
      const { revision, ...fields } = value;
      let saved: Awaited<ReturnType<typeof business>> | null = null;
      const database = await connectDatabase();
      await database.connection.transaction(async session => {
        const existing = await business();
        if (existing?.revision !== revision) throw new ApiError(409, 'Settings changed on another device. Reload before saving.');
        saved = await BusinessModel.findOneAndUpdate({ _id: 'restaurant', revision }, { $set: { ...fields, changedBy: user.id }, $inc: { revision: 1 } },
          { returnDocument: 'after', runValidators: true, session }).lean();
        if (!saved) throw new ApiError(409, 'Settings changed on another device. Reload before saving.');
        await AuditModel.create([{ actor: user.name, action: 'Settings updated', entityId: 'restaurant',
          detail: 'GST ' + existing.taxRate * 2 + '% → ' + fields.taxRate * 2 + '%; applies to new orders.' }], { session });
      });
      return json({ business: businessDto(saved!) });
    }
    return json({ message: 'Not found.' }, 404);
  } catch (error) { return failure(error); }
}
