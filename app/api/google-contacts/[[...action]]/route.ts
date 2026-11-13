import { NextRequest, NextResponse } from 'next/server';
import {
  callbackPath, config, connection, ContactError, contactInput, contactScope, cookieName, identity, matchSecret,
  pkceChallenge, randomValue, saveConnection, sign, singleContactWrite, stateCookie, syncContact, token, verify, type ContactRole,
} from '../../../../lib/google-contacts-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ action?: string[] }> };
type Session = { role: ContactRole; fingerprint: string; exp: number };
type Flow = { state: string; verifier: string; exp: number };
const sessionSeconds = 60 * 60 * 12;
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const cookie = (secure: boolean, maxAge: number) => ({ httpOnly: true, secure, maxAge, sameSite: 'lax' as const, path: '/api/google-contacts' });

function session(request: NextRequest, settings: NonNullable<ReturnType<typeof config>>) {
  const auth = verify<Session>(settings, request.cookies.get(cookieName)?.value);
  if (!auth || (auth.role !== 'owner' && auth.role !== 'staff')) return;
  const code = settings[auth.role];
  if (matchSecret(auth.fingerprint, pkceChallenge(code))) return auth.role;
}
function redirect(settings: NonNullable<ReturnType<typeof config>>, result: string) {
  return NextResponse.redirect(new URL('/?contactConnection=' + result + '#settings', settings.origin));
}

export async function GET(request: NextRequest, context: Context) {
  const settings = config();
  const action = ((await context.params).action ?? []).join('/');
  if (!settings) return action === '' ? response({ configured: false }) : response({ message: 'Contact sync is not configured.' }, 503);
  if (!settings.storageReady) return action === '' ? response({ configured: false, reason: 'storage' }) : response({ message: 'Google Contacts needs persistent storage.' }, 503);
  const role = session(request, settings);
  if (!action) {
    try {
      return response({ configured: true, access: role ?? null, connected: role ? Boolean(await connection(settings)) : false,
        account: role === 'owner' ? settings.account : undefined });
    } catch { return response({ configured: false, reason: 'storage-unavailable' }, 503); }
  }
  if (action !== 'callback') return response({ message: 'Not found.' }, 404);
  if (role !== 'owner') return redirect(settings, 'unauthorized');
  const flow = verify<Flow>(settings, request.cookies.get(stateCookie)?.value);
  const params = request.nextUrl.searchParams;
  let result = 'failed';
  try {
    if (!flow || !matchSecret(flow.state, params.get('state') ?? '') || !params.get('code')) return redirect(settings, 'failed');
    const credentials = await token(settings, {
      grant_type: 'authorization_code', code: params.get('code')!, code_verifier: flow.verifier, redirect_uri: settings.origin + callbackPath,
    });
    const profile = await identity(credentials.access_token);
    if (profile.email_verified !== true || profile.email?.toLowerCase() !== settings.account) result = 'wrong-account';
    else if (credentials.refresh_token && credentials.scope?.split(' ').includes(contactScope)) {
      await singleContactWrite(settings, () => saveConnection(settings, credentials.refresh_token!));
      result = 'connected';
    }
  } catch { /* No Google tokens or details are returned in the redirect. */ }
  const next = redirect(settings, result);
  next.cookies.set(stateCookie, '', cookie(settings.secure, 0));
  return next;
}

export async function POST(request: NextRequest, context: Context) {
  const settings = config();
  if (!settings) return response({ message: 'Google Contacts is not configured.' }, 503);
  if (!settings.storageReady) return response({ message: 'Google Contacts needs persistent storage.' }, 503);
  if (request.headers.get('origin') !== settings.origin) return response({ message: 'Invalid request origin.' }, 403);
  const action = ((await context.params).action ?? []).join('/');
  const role = session(request, settings);
  try {
    if (action === 'lock') {
      const next = response({ ok: true });
      next.cookies.set(cookieName, '', cookie(settings.secure, 0));
      next.cookies.set(stateCookie, '', cookie(settings.secure, 0));
      return next;
    }
    if (action === 'unlock') {
      const input = await request.json().catch(() => null);
      if (typeof input?.code !== 'string' || input.code.length > 256) return response({ message: 'Enter a valid contact sync access code.' }, 400);
      const grant = matchSecret(input.code, settings.owner) ? 'owner' : matchSecret(input.code, settings.staff) ? 'staff' : undefined;
      if (!grant) return response({ message: 'That access code was not accepted.' }, 403);
      const next = response({ ok: true });
      next.cookies.set(cookieName, sign(settings, { role: grant, fingerprint: pkceChallenge(settings[grant]), exp: Date.now() + sessionSeconds * 1000 }), cookie(settings.secure, sessionSeconds));
      return next;
    }
    if (!role) return response({ message: 'Unlock Google Contacts on this browser before syncing.' }, 401);
    if (action === 'authorize') {
      if (role !== 'owner') return response({ message: 'Only the owner can connect the Google account.' }, 403);
      const flow = { state: randomValue(), verifier: randomValue(), exp: Date.now() + 600_000 };
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.origin + callbackPath, response_type: 'code',
        scope: 'openid email ' + contactScope, state: flow.state, access_type: 'offline', prompt: 'consent',
        login_hint: settings.account, code_challenge: pkceChallenge(flow.verifier), code_challenge_method: 'S256' }).toString();
      const next = response({ url: url.toString() });
      next.cookies.set(stateCookie, sign(settings, flow), cookie(settings.secure, 600));
      return next;
    }
    if (action === 'sync') {
      const raw = await request.text();
      if (raw.length > 4096) return response({ message: 'Contact data is too long.' }, 400);
      const input = contactInput(JSON.parse(raw));
      await singleContactWrite(settings, () => syncContact(settings, input));
      return response({ synced: true });
    }
    return response({ message: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof ContactError) return response({ message: error.message }, error.status);
    if (error instanceof SyntaxError) return response({ message: 'Invalid contact data.' }, 400);
    return response({ message: 'Contact sync could not be completed. Try again.' }, 503);
  }
}
