import type { Business, Database, Role } from './demo';

export type SignedInUser = { id: string; name: string; email: string; role: Role };
export type ConnectedWorkspace = { user: SignedInUser; business: Business; operations: Omit<Database, 'guests' | 'business'> & { revision: number; syncVersion: string } };

export async function workspaceRequest(path: string, options: RequestInit = {}) {
  const result = await fetch('/api/workspace/' + path, {
    ...options, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload.message || 'The request failed. Please try again.');
  return payload;
}

export async function downloadWorkspaceFile(path: string, filename: string, current: () => boolean = () => true) {
  const response = await fetch('/api/workspace/' + path, { cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Download failed. Please retry.');
  }
  const blob = await response.blob();
  if (!current()) return;
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
