import 'server-only';
import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

const options = { timestamps: true, strict: 'throw' as const };
const userSchema = new Schema({
  _id: { type: String, required: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['Owner', 'Staff'], required: true },
  active: { type: Boolean, default: true },
}, options);
userSchema.index({ email: 1 }, { unique: true });
const sessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, options);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });

const companionSchema = new Schema({
  id: { type: String, required: true }, name: { type: String, required: true },
  phone: { type: String, required: true }, saveToGoogle: { type: Boolean, default: false },
}, { _id: false });
const customerSchema = new Schema({
  _id: { type: String, required: true }, name: { type: String, required: true },
  nameKey: { type: String, required: true }, phone: { type: String, default: '' },
  notes: { type: String, default: '' }, contactNote: { type: String, default: '' },
  companions: { type: [companionSchema], default: [] },
  assigned: { type: String, enum: ['Owner', 'Staff'], required: true },
  sync: { type: String, enum: ['Synced', 'Sync pending', 'No phone'], required: true },
  syncConfirmedAt: String, syncIssue: String,
  revision: { type: Number, default: 0 }, changedBy: { type: String, required: true },
}, options);
customerSchema.index({ nameKey: 1, _id: 1 });
customerSchema.index({ phone: 1, _id: 1 });
customerSchema.index({ updatedAt: -1, _id: -1 });

const businessSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true }, address: { type: String, required: true },
  phone: { type: String, required: true }, gstin: { type: String, default: '' },
  footer: { type: String, default: '' }, taxRate: { type: Number, required: true },
  contactSync: { type: Boolean, default: false }, staffDiscountLimit: { type: Number, default: 10 },
  revision: { type: Number, default: 0 }, changedBy: { type: String, required: true },
}, options);
const integrationSchema = new Schema({
  _id: { type: String, required: true }, encrypted: { type: String, required: true },
}, options);
const lockSchema = new Schema({
  _id: { type: String, required: true }, owner: { type: String, required: true }, expiresAt: { type: Date, required: true },
});
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const attemptSchema = new Schema({
  _id: { type: String, required: true }, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true },
});
attemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const auditSchema = new Schema({
  actor: { type: String, required: true }, action: { type: String, required: true },
  entityId: { type: String, required: true }, at: { type: Date, default: Date.now },
  detail: { type: String, default: '' },
});
// Large operational snapshots are validated by Zod before persistence. Search and
// concurrency fields live outside the snapshot so MongoDB can index them.
const catalogSchema = new Schema({ _id: String, payload: { type: Schema.Types.Mixed, required: true }, revision: { type: Number, default: 0 } }, options);
const orderSchema = new Schema({ _id: String, payload: { type: Schema.Types.Mixed, required: true }, status: String, table: String,
  requestId: String, occupied: Boolean, revision: { type: Number, default: 0 } }, options);
orderSchema.index({ requestId: 1 }, { unique: true, sparse: true });
orderSchema.index({ occupied: 1, table: 1 });
orderSchema.index({ status: 1, updatedAt: -1 });
orderSchema.index({ 'payload.guestId': 1, status: 1 });
orderSchema.index({ 'payload.events.at': -1 });
orderSchema.index({ 'payload.payments.date': -1 });
orderSchema.index({ 'payload.advance.date': -1 });
const invoiceSchema = new Schema({ _id: String, orderId: { type: String, required: true }, date: { type: String, required: true }, payload: { type: Schema.Types.Mixed, required: true } }, options);
invoiceSchema.index({ orderId: 1 }, { unique: true });
invoiceSchema.index({ date: -1, _id: -1 });
invoiceSchema.index({ 'payload.order.guestId': 1, date: -1, _id: -1 });
const refundSchema = new Schema({ _id: String, billId: { type: String, required: true }, payload: { type: Schema.Types.Mixed, required: true } }, options);
refundSchema.index({ billId: 1, createdAt: -1 });
refundSchema.index({ 'payload.at': -1, _id: -1 });
const counterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } });
auditSchema.index({ at: -1, _id: -1 });
auditSchema.index({ entityId: 1, at: -1 });

function registered<T>(name: string, schema: Schema<T>): Model<T> {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema);
}
export const UserModel = registered<InferSchemaType<typeof userSchema>>('RestaurantUser', userSchema);
export const SessionModel = registered<InferSchemaType<typeof sessionSchema>>('RestaurantSession', sessionSchema);
export const CustomerModel = registered<InferSchemaType<typeof customerSchema>>('RestaurantCustomer', customerSchema);
export const BusinessModel = registered<InferSchemaType<typeof businessSchema>>('RestaurantBusiness', businessSchema);
export const IntegrationModel = registered<InferSchemaType<typeof integrationSchema>>('RestaurantIntegration', integrationSchema);
export const LockModel = registered<InferSchemaType<typeof lockSchema>>('RestaurantLock', lockSchema);
export const AttemptModel = registered<InferSchemaType<typeof attemptSchema>>('RestaurantAttempt', attemptSchema);
export const AuditModel = registered<InferSchemaType<typeof auditSchema>>('RestaurantAudit', auditSchema);
export const CatalogModel = registered<InferSchemaType<typeof catalogSchema>>('RestaurantCatalog', catalogSchema);
export const OrderModel = registered<InferSchemaType<typeof orderSchema>>('RestaurantOrder', orderSchema);
export const InvoiceModel = registered<InferSchemaType<typeof invoiceSchema>>('RestaurantInvoice', invoiceSchema);
export const RefundModel = registered<InferSchemaType<typeof refundSchema>>('RestaurantRefund', refundSchema);
export const CounterModel = registered<InferSchemaType<typeof counterSchema>>('RestaurantCounter', counterSchema);

let readIndexes: Promise<void> | undefined;
export function ensureReadIndexes() {
  readIndexes ??= Promise.all([OrderModel, InvoiceModel, RefundModel].map(model => model.createIndexes())).then(() => {})
    .catch(error => { readIndexes = undefined; throw error; });
  return readIndexes;
}

/** Only add declared indexes. Existing indexes are never dropped automatically. */
export async function ensureIndexes() {
  await Promise.all([UserModel, SessionModel, CustomerModel, BusinessModel, IntegrationModel, LockModel, AttemptModel, AuditModel, CatalogModel, OrderModel, InvoiceModel, RefundModel, CounterModel]
    .map(async model => model.createIndexes()));
}
