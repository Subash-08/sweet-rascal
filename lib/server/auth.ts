import 'server-only';
import { randomBytes, createHash, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { connectDatabase, databaseConfigured } from './database';
import { SessionModel, UserModel } from './models';
import type { Role } from '../demo';

const scrypt = promisify(nodeScrypt);
// Local apps on different ports still share the localhost cookie namespace.
export const sessionCookie = process.env.MONGODB_DB?.trim() === 'sweet_rascal_demo' ? 'sr_demo_session' : 'sr_session';
export const sessionLifetime = 12 * 60 * 60;
export type WorkspaceUser = { id: string; email: string; name: string; role: Role };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function applicationOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN?.trim() || process.env.CONTACTS_ORIGIN?.trim() || '');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return '';
    return url.origin;
  } catch { return ''; }
}
export function checkOrigin(request: NextRequest) {
  if (!applicationOrigin() || request.headers.get('origin') !== applicationOrigin()) throw new ApiError(403, 'Open Sweet Rascal at its configured address and try again.');
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return salt + '.' + hash.toString('hex');
}
export async function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split('.');
  if (!salt || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false;
  const candidate = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
export async function currentUser(): Promise<WorkspaceUser | null> {
  if (!databaseConfigured()) return null;
  const raw = (await cookies()).get(sessionCookie)?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  await connectDatabase();
  const session = await SessionModel.findOne({ _id: tokenHash(raw), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await UserModel.findOne({ _id: session.userId, active: true }).lean();
  return user ? { id: user._id, email: user.email, name: user.name, role: user.role as Role } : null;
}
export async function requireUser(ownerOnly = false) {
  const user = await currentUser();
  if (!user) throw new ApiError(401, 'Sign in to continue.');
  if (ownerOnly && user.role !== 'Owner') throw new ApiError(403, 'Owner access is required.');
  return user;
}
