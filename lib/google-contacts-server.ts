import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { connectDatabase, databaseConfigured } from './server/database';
import { IntegrationModel, LockModel } from './server/models';

export const contactScope = 'https://www.googleapis.com/auth/contacts';
export const cookieName = 'sr_contact_access';
export const stateCookie = 'sr_contact_oauth';
export const callbackPath = '/api/google-contacts/callback';
export type ContactRole = 'owner' | 'staff';

export class ContactError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function config() {
  const origin = process.env.CONTACTS_ORIGIN?.trim();
  const { GOOGLE_CONTACTS_CLIENT_ID: clientId, GOOGLE_CONTACTS_CLIENT_SECRET: clientSecret, GOOGLE_CONTACTS_ACCOUNT: account,
    CONTACTS_OWNER_CODE: owner, CONTACTS_STAFF_CODE: staff, CONTACTS_STORAGE_KEY: rawKey } = process.env;
  if (!origin || !clientId || !clientSecret || !account || !/^[a-f\d]{64}$/i.test(rawKey ?? '')) return null;
  if (!databaseConfigured() && (!owner || !staff || owner === staff || !/^[a-f\d]{32,}$/i.test(owner) || !/^[a-f\d]{32,}$/i.test(staff))) return null;
  try {
    const url = new URL(origin);
    if ((url.origin !== origin && url.origin + '/' !== origin) ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) return null;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    const redis = redisUrl && redisToken && new URL(redisUrl).protocol === 'https:'
      ? { url: redisUrl, token: redisToken, key: 'sweet-rascal:contacts:' + pkceChallenge(url.origin) } : undefined;
    return { origin: url.origin, clientId, clientSecret, account: account.trim().toLowerCase(), owner: owner || '', staff: staff || '',
      key: Buffer.from(rawKey!, 'hex'), secure: url.protocol === 'https:',
      redis, mongo: databaseConfigured(), integrationKey: 'google-contacts:' + pkceChallenge(url.origin),
      storageReady: databaseConfigured() || Boolean(redis) || !(process.env.VERCEL === '1' || redisUrl || redisToken),
      tokenFile: resolve(/* turbopackIgnore: true */ process.env.CONTACTS_TOKEN_FILE || '.sweet-rascal/google-contacts.enc') };
  } catch { return null; }
}
type Config = NonNullable<ReturnType<typeof config>>;

export function matchSecret(a: string, b: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
export function sign(c: Config, data: object) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + createHmac('sha256', c.key).update('sr-contacts:' + payload).digest('base64url');
}
export function verify<T>(c: Config, raw?: string): T | undefined {
  const [payload, mac, extra] = (raw ?? '').split('.');
  if (!payload || !mac || extra !== undefined || !matchSecret(mac, createHmac('sha256', c.key).update('sr-contacts:' + payload).digest('base64url'))) return;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.exp === 'number' && data.exp > Date.now()) return data as T;
  } catch { /* Invalid cookie. */ }
}
export function randomValue() { return randomBytes(32).toString('base64url'); }
export function pkceChallenge(verifier: string) { return createHash('sha256').update(verifier).digest('base64url'); }

type Connection = { account: string; clientId: string; refresh: string };
async function redisCommand<T>(redis: NonNullable<Config['redis']>, command: (string | number)[]): Promise<T> {
  try {
    const response = await fetch(redis.url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + redis.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    const data = response.ok ? await response.json() : null;
    if (data && !data.error && 'result' in data) return data.result as T;
  } catch { /* Keep storage credentials and provider errors on the server. */ }
  throw new ContactError(503, 'Google Contacts storage is unavailable. Try again.');
}
export async function connection(c: Config) {
  if (c.mongo) await connectDatabase();
  const stored = c.mongo
    ? (await IntegrationModel.findById(c.integrationKey).lean())?.encrypted
    : c.redis
    ? await redisCommand<string | null>(c.redis, ['GET', c.redis.key])
    : await readFile(c.tokenFile, 'utf8').catch(() => null);
  if (!stored) return null;
  try {
    const [iv, tag, bytes] = stored.split('.');
    const decrypt = createDecipheriv('aes-256-gcm', c.key, Buffer.from(iv, 'base64url'));
    decrypt.setAuthTag(Buffer.from(tag, 'base64url'));
    const value = JSON.parse(Buffer.concat([decrypt.update(Buffer.from(bytes, 'base64url')), decrypt.final()]).toString()) as Connection;
    return value.account === c.account && value.clientId === c.clientId && value.refresh ? value : null;
  } catch { return null; }
}
export async function saveConnection(c: Config, refresh: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', c.key, iv);
  const value = Buffer.concat([cipher.update(JSON.stringify({ account: c.account, clientId: c.clientId, refresh })), cipher.final()]);
  const encrypted = [iv, cipher.getAuthTag(), value].map(part => part.toString('base64url')).join('.');
  if (c.mongo) {
    await connectDatabase();
    await IntegrationModel.updateOne({ _id: c.integrationKey }, { $set: { encrypted } }, { upsert: true, runValidators: true });
    return;
  }
  if (c.redis) {
    if (await redisCommand(c.redis, ['SET', c.redis.key, encrypted]) !== 'OK') {
      throw new ContactError(503, 'Could not save the Google Contacts connection.');
    }
    return;
  }
  await mkdir(dirname(c.tokenFile), { recursive: true, mode: 0o700 });
  const temp = c.tokenFile + '.' + randomValue();
  await writeFile(temp, encrypted, { mode: 0o600, flag: 'wx' });
  try { await rename(temp, c.tokenFile); } finally { await unlink(temp).catch(() => {}); }
}

async function google<T>(url: string, init: RequestInit, fail: (status: number) => ContactError): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { throw new ContactError(503, 'Google could not be reached. Retry contact sync.'); }
  if (!response.ok) throw fail(response.status);
  return response.json();
}
type Tokens = { access_token: string; refresh_token?: string; scope: string };
export function token(c: Config, fields: Record<string, string>) {
  return google<Tokens>('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ ...fields, client_id: c.clientId, client_secret: c.clientSecret }),
  }, status => status === 400 || status === 401
    ? new ContactError(409, 'Google authorization needs attention. Ask the owner to reconnect in Settings.')
    : new ContactError(503, 'Google could not authorize the connection. Try again.'));
}
export function identity(access: string) {
  return google<{ email?: string; email_verified?: boolean }>('https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: 'Bearer ' + access } }, () => new ContactError(403, 'Could not verify the Google account.'));
}

type GooglePerson = {
  resourceName: string; metadata?: { sources?: unknown[] }; clientData?: { key: string; value: string }[];
  phoneNumbers?: { value: string; canonicalForm?: string }[];
};
type Contact = { id: string; name: string; phone: string; note: string };
const marker = 'sweet_rascal_contact_id';
const fields = 'metadata,phoneNumbers,clientData';

export function normalPhone(value: string) {
  const raw = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && !/^91\d{10}$/.test(raw)) return '';
  const digits = raw.replace(/^0091(?=\d{10}$)/, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
  return /^\d{10}$/.test(digits) ? digits : '';
}
export function contactInput(raw: unknown): Contact {
  const value = raw as Partial<Contact> | null;
  if (!value || typeof value.id !== 'string' || !/^(guest|companion)-[a-f\d-]{36}$/i.test(value.id) ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120 ||
      typeof value.phone !== 'string' || !/^[+\d ().-]{10,24}$/.test(value.phone) || !normalPhone(value.phone) ||
      typeof value.note !== 'string' || value.note.length > 500) throw new ContactError(400, 'Enter a name, valid mobile number and a note of up to 500 characters.');
  return { id: value.id, name: value.name.trim(), phone: normalPhone(value.phone), note: value.note.trim() };
}

let tail: Promise<unknown> = Promise.resolve();
export function serial<T>(action: () => Promise<T>) {
  const result = tail.then(action);
  tail = result.catch(() => {});
  return result;
}
export async function singleContactWrite<T>(c: Config, action: () => Promise<T>) {
  if (c.mongo) {
    await connectDatabase();
    const owner = randomValue();
    const now = new Date();
    try {
      await LockModel.findOneAndUpdate({ _id: c.integrationKey, expiresAt: { $lte: now } },
        { $set: { owner, expiresAt: new Date(Date.now() + 90_000) } }, { upsert: true });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        throw new ContactError(409, 'Another contact is syncing. Retry in a moment.');
      }
      throw error;
    }
    try { return await action(); }
    finally { await LockModel.deleteOne({ _id: c.integrationKey, owner }).catch(() => {}); }
  }
  if (!c.redis) return serial(action);
  const key = c.redis.key + ':lock';
  const owner = randomValue();
  if (await redisCommand(c.redis, ['SET', key, owner, 'NX', 'EX', 90]) !== 'OK') {
    throw new ContactError(409, 'Another contact is syncing. Please retry in a moment.');
  }
  try { return await action(); }
  finally {
    const release = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";
    await redisCommand(c.redis, ['EVAL', release, 1, key, owner]).catch(() => {});
  }
}
export async function syncContact(c: Config, input: Contact) {
  const linked = await connection(c);
  if (!linked) throw new ContactError(409, 'Ask the owner to connect Google Contacts in Settings.');
  const tokens = await token(c, { grant_type: 'refresh_token', refresh_token: linked.refresh });
  const call = <T>(endpoint: string, method = 'GET', body?: object) =>
    google<T>('https://people.googleapis.com/v1/' + endpoint, {
      method, headers: { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }, status => status === 401 || status === 403
      ? new ContactError(409, 'Google Contacts permission is unavailable. Ask the owner to check the connection.')
      : new ContactError(503, 'Google did not confirm contact sync. Please retry.'));
  let pageToken = '';
  let match: GooglePerson | undefined;
  const duplicates = new Set<string>();
  for (let page = 0; ; page++) {
    if (page === 50) throw new ContactError(503, 'The Google address book is too large for this pilot.');
    const params = new URLSearchParams({ personFields: fields, pageSize: '1000', sources: 'READ_SOURCE_TYPE_CONTACT' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await call<{ connections?: GooglePerson[]; nextPageToken?: string }>('people/me/connections?' + params);
    for (const person of result.connections ?? []) {
      if (person.clientData?.some(item => item.key === marker && item.value === input.id)) {
        if (match && match.resourceName !== person.resourceName) throw new ContactError(409, 'More than one Google contact is linked. Review the address book before retrying.');
        match = person;
      }
      if (person.phoneNumbers?.some(phone => normalPhone(phone.canonicalForm ?? phone.value) === input.phone)) duplicates.add(person.resourceName);
    }
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  if ([...duplicates].some(id => id !== match?.resourceName)) throw new ContactError(409, 'That number already belongs to another Google contact. Review it before retrying.');
  const managed = { names: [{ givenName: input.name }], phoneNumbers: [{ value: '+91' + input.phone, type: 'mobile' }],
    biographies: input.note ? [{ value: input.note, contentType: 'TEXT_PLAIN' }] : [] };
  if (match) {
    if (!/^people\/[a-z\d_-]+$/i.test(match.resourceName) || !match.metadata?.sources?.length) throw new ContactError(409, 'The linked Google contact needs review.');
    await call(match.resourceName + ':updateContact?updatePersonFields=names,phoneNumbers,biographies&personFields=metadata', 'PATCH',
      { ...managed, resourceName: match.resourceName, metadata: { sources: match.metadata.sources } });
  } else {
    await call('people:createContact?personFields=metadata', 'POST', { ...managed, clientData: [{ key: marker, value: input.id }] });
  }
}
