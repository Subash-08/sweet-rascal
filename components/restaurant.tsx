'use client';

import { useEffect, useRef, useState, type ReactNode, type SetStateAction, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { pageAtPath, pagePaths } from '../lib/routes';
import { WorkspaceContentContext } from './workspace-content';
import { BarChart3, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, CreditCard, Ellipsis, FileText, History, LayoutDashboard, LayoutGrid, LogOut, Plus, ReceiptText, RefreshCw, Search, Settings2, ShieldCheck, UserRound, Users, Utensils, X } from 'lucide-react';
import { HeartMark } from './heart-mark';
import { CustomerSearch } from './customer-search';
import { type Bill, type Database, type Discount, type Guest, type Line, type OrderEvent, type Page, type Payment, type Role, type Visit, defaultStaffDiscountLimit, discountAmount, emptyVisit, initialData, isRetiredSampleGuest, isSampleGuest, occupiesTable, payable, refundTotal, roleNames, rolePages, roles, serviceDay, sumPayments, totals } from '../lib/demo';
import { Brand, Dialog, Empty, Field, Form, SearchInput, Title } from './ui';
import { Checkout, OrderEditor } from './billing';
import { BillPreview } from './invoice';
import { BillingDesk, Activity } from './desk';
import { BillList, Dashboard, guestLabel, tableName } from './overview';
import { Reports } from './reports';
import { ConnectionGuard, InstallApp, useAppInstallation } from './install-app';
import { contactRequest, GoogleContactsAccess } from './google-contacts-settings';
import { Customers, Dining, GuestEditor, Menu, Orders, Payments, Settings, StaffAccess } from './operations';
import { ConnectedCustomerBills, ConnectedCustomers } from './connected-customers';
import { ConnectedTeam } from './connected-team';
import { workspaceRequest, type ConnectedWorkspace } from '../lib/workspace-client';
import { RefundDialog } from './refund-dialog';
import { ConnectedHistory } from './connected-history';
import { ConnectedOverview } from './connected-overview';

const storageKey = 'sweet-rascal-prototype-v1';
const navigation = [
  { label: 'SERVICE', pages: ['Overview', 'Dining tables', 'Orders', 'Billing desk', 'Bills', 'Payments'] },
  { label: 'MANAGE', pages: ['Customers', 'Menu', 'Reports', 'Activity', 'Staff & access', 'Settings'] },
] as { label: string; pages: Page[] }[];
const icons = {
  Overview: LayoutDashboard, 'Dining tables': LayoutGrid, Orders: ClipboardList, 'Billing desk': ReceiptText, Activity: History, Bills: FileText, Payments: CreditCard,
  Customers: Users, Menu: Utensils, Reports: BarChart3, 'Staff & access': ShieldCheck, Settings: Settings2, 'My profile': UserRound,
};
const quickPages = ['Dining tables', 'Orders', 'Billing desk', 'Bills'] as const;
type Detail = { kind: 'order'; order: Visit } | { kind: 'bill' | 'guest'; id: string };
const activeOrder = (order: Visit) => ['Draft', 'Open', 'Upcoming'].includes(order.status);
const localTime = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date());

export default function Restaurant({ connected, onSignOut, children }: { connected?: ConnectedWorkspace; onSignOut?: () => Promise<void>; children?: ReactNode }) {
  const router = useRouter();
  const appInstallation = useAppInstallation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = pageAtPath(pathname);
  const previousPath = useRef(pathname);
  const internalNavigation = useRef(false);
  const [database, update] = useState<Database>(() => connected ? {
    ...connected.operations, business: connected.business, guests: [],
  } : initialData);
  const newOrderId = useRef<string>('');
  const catalogRevision = useRef(connected?.operations.revision ?? 0);
  const [role, setRole] = useState<Role>(connected?.user.role || 'Owner');
  const [detail, setDetail] = useState<Detail>();
  const [guestEditor, setGuestEditor] = useState<{ guest?: Guest; inOrder?: boolean; linkBilled?: boolean }>();
  const [customerLink, setCustomerLink] = useState<{ order: Visit; guest?: Guest }>();
  const [checkout, setCheckout] = useState<Visit>();
  const [departure, setDeparture] = useState<Visit>();
  const [confirmation, setConfirmation] = useState<'void' | 'cancel' | 'leave'>();
  const [drawer, setDrawer] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [sessionProfile, setSessionProfile] = useState<Partial<Record<Role, string>>>({});
  const allowed = rolePages[role];
  const data = database;
  const issueLock = useRef(false);
  const pendingNavigation = useRef<(() => void) | undefined>(undefined);
  const editorChanged = useRef(false);
  const [actorId, setActorId] = useState('');
  const [startOptions, setStartOptions] = useState(false);
  const [customerRefresh, setCustomerRefresh] = useState(0);
  const [refundBill, setRefundBill] = useState<Bill>();
  const refundLock = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const mutationLock = useRef(false);
  const mutationVersion = useRef(0);
  const operationsVersion = useRef(connected?.operations.syncVersion);
  const [saving, setSaving] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const [billRetry, setBillRetry] = useState(0);
  const [billLoad, setBillLoad] = useState<{ id: string; error?: string; loaded?: boolean }>();
  const selectedBillId = connected ? searchParams.get('bill') : null;
  const readingBill = useRef(false);
  readingBill.current = Boolean(selectedBillId);
  const historyRequest = useRef<AbortController | null>(null);
  const locationKey = pathname + '?' + searchParams.toString();
  const historyLocation = useRef(locationKey);
  historyLocation.current = locationKey;
  useEffect(() => () => { historyRequest.current?.abort(); }, [locationKey]);
  useEffect(() => {
    if (!connected) return;
    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;
    const canRefresh = () => !disposed && !document.hidden && navigator.onLine &&
      !mutationLock.current && !readingBill.current && !document.querySelector('dialog[open]');

    async function syncOperations() {
      if (pending) return;
      clearTimeout(timer);
      if (document.hidden || !navigator.onLine) return;
      let delay = 10_000;
      pending = true;
      const startedAt = mutationVersion.current;
      try {
        if (!canRefresh()) return;
        const query = new URLSearchParams({ since: operationsVersion.current ?? '' });
        const result = await workspaceRequest('operations?' + query);
        if (!canRefresh() || startedAt !== mutationVersion.current || result.unchanged) return;
        const { syncVersion, revision, ...operations } = result as ConnectedWorkspace['operations'];
        operationsVersion.current = syncVersion;
        catalogRevision.current = revision;
        update(state => ({ ...state, ...operations }));
        setReadVersion(value => value + 1);
      } catch {
        delay = 30_000;
      } finally {
        pending = false;
        if (!disposed && !document.hidden && navigator.onLine) timer = setTimeout(syncOperations, delay);
      }
    }

    timer = setTimeout(syncOperations, 10_000);
    document.addEventListener('visibilitychange', syncOperations);
    window.addEventListener('focus', syncOperations);
    window.addEventListener('online', syncOperations);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', syncOperations);
      window.removeEventListener('focus', syncOperations);
      window.removeEventListener('online', syncOperations);
    };
  }, [connected]);

  async function requestMutation(path: string, payload: object) {
    if (mutationLock.current) throw new Error('Please wait for the current save to finish.');
    mutationLock.current = true; mutationVersion.current += 1; setSaving(true);
    try {
      const result = await workspaceRequest(path, { method: 'POST', body: JSON.stringify(payload, (key, value) => path === 'orders' && key === 'events' ? undefined : value) });
      setReadVersion(value => value + 1);
      return result;
    }
    finally { mutationLock.current = false; setSaving(false); }
  }
  function safely<T extends unknown[]>(action: (...args: T) => Promise<string | void>) {
    return async (...args: T): Promise<string | void> => {
      try { return await action(...args); }
      catch (error) { const message = error instanceof Error ? error.message : 'Could not save. Try again.'; setMessage(message); return message; }
    };
  }
  async function updateCatalog(value: SetStateAction<Database>): Promise<void> {
    const next = typeof value === 'function' ? value(database) : value;
    if (!connected) { update(next); return; }
    const result = await requestMutation('catalog', { dishes: next.dishes, categories: next.categories, tables: next.tables, revision: catalogRevision.current });
    catalogRevision.current = result.revision;
    update(state => ({ ...state, dishes: result.dishes, categories: result.categories, tables: result.tables }));
  }
  useEffect(() => {
    if (!connected || !selectedBillId) return;
    let active = true;
    setBillLoad({ id: selectedBillId });
    queueMicrotask(() => {
      if (!active) return;
      workspaceRequest('invoice?' + new URLSearchParams({ id: selectedBillId })).then(result => {
        if (!active) return;
        update(state => ({ ...state, bills: [...state.bills.filter(item => item.id !== selectedBillId), result.bill],
          orders: result.order ? putOrder(state, result.order) : state.orders,
          refunds: [...(state.refunds ?? []).filter(item => item.billId !== selectedBillId), ...result.refunds] }));
        setBillLoad({ id: selectedBillId, loaded: true });
      }).catch(error => { if (active) setBillLoad({ id: selectedBillId, error: error.message }); });
    });
    return () => { active = false; };
  }, [connected, selectedBillId, billRetry]);

  useEffect(() => {
    if (!drawer) return;
    const desktop = matchMedia('(min-width: 931px)');
    const closeOnDesktop = () => { if (desktop.matches) setDrawer(false); };
    const lock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLElement>('.drawer-close')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') setDrawer(false);
      if (event.key === 'Tab') {
        const buttons = sidebar.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled), a[href]');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = lock;
      document.removeEventListener('keydown', keyboard);
      desktop.removeEventListener('change', closeOnDesktop);
      moreButton.current?.focus();
    };
  }, [drawer]);
  useEffect(() => {
    if (connected) {
      setReady(true);
      return;
    }
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const snapshot = JSON.parse(saved) as { database: Database; role: string; profile: Partial<Record<Role, string>> };
          if (snapshot.database?.business) {
            const nextRole = snapshot.role === 'Owner' ? 'Owner' : 'Staff';
            const historicTaxes = new Map(snapshot.database.bills.map(bill => [bill.order.id, bill.taxRate]));
            const normalizeOrder = (order: Visit): Visit => ({ ...order, assigned: order.assigned === 'Owner' ? 'Owner' : 'Staff',
              taxRate: order.taxRate ?? historicTaxes.get(order.id) ?? snapshot.database.business.taxRate,
              guestId: isRetiredSampleGuest(order.guestId) ? '' : order.guestId });
            update({
              ...snapshot.database,
              orders: snapshot.database.orders.map(normalizeOrder),
              bills: snapshot.database.bills.map(bill => ({ ...bill, order: normalizeOrder(bill.order) })),
              guests: snapshot.database.guests.filter(guest => !isRetiredSampleGuest(guest.id)).map(guest => ({ ...guest, assigned: guest.assigned === 'Owner' ? 'Owner' : 'Staff',
                sync: guest.syncConfirmedAt ? 'Synced' : guest.phone || guest.companions?.some(person => person.saveToGoogle) ? 'Sync pending' : 'No phone' })),
              staff: snapshot.database.staff.map(member => ({ ...member, role: member.role === 'Owner' ? 'Owner' : 'Staff' })),
            });
            setRole(nextRole); setSessionProfile(snapshot.profile ?? {});
          }
        } else {
        }
      } catch { /* Keep the seeded demo when storage is unavailable. */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [connected]);
  useEffect(() => {
    if (!ready || connected) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ database, role, profile: sessionProfile })); } catch { /* Session still works in memory. */ }
  }, [database, role, ready, sessionProfile, connected]);
  useEffect(() => {
    const migrate = () => {
      const path = Object.values(pagePaths).find(path => '#' + path.slice(1) === location.hash);
      if (path) router.replace(path + location.search);
    };
    migrate();
    window.addEventListener('hashchange', migrate);
    return () => window.removeEventListener('hashchange', migrate);
  }, [router]);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    if (!internalNavigation.current) { setDetail(undefined); setCheckout(undefined); setDrawer(false); editorChanged.current = false; }
    internalNavigation.current = false;
    previousPath.current = pathname;
  }, [pathname]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3600);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    function protectClose(event: BeforeUnloadEvent) {
      if (editorChanged.current) { event.preventDefault(); event.returnValue = ''; }
    }
    window.addEventListener('beforeunload', protectClose);
    return () => window.removeEventListener('beforeunload', protectClose);
  }, []);

  function go(next: Page) {
    if (!allowed.includes(next)) return;
    historyRequest.current?.abort();
    internalNavigation.current = pathname !== pagePaths[next];
    router.push(pagePaths[next]);
    setDetail(undefined); setDrawer(false); setSearch(false);
    editorChanged.current = false;
    window.scrollTo({ top: 0 });
  }
  function navigateLink(event: MouseEvent<HTMLAnchorElement>, next: Page) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); protectNavigation(() => go(next));
  }
  async function refreshWorkspace() {
    if (!connected || mutationLock.current) return;
    historyRequest.current?.abort();
    mutationLock.current = true;
    mutationVersion.current += 1;
    setSaving(true);
    try {
      const [operations, { business }] = await Promise.all([workspaceRequest('operations'), workspaceRequest('business')]);
      catalogRevision.current = operations.revision;
      operationsVersion.current = operations.syncVersion;
      update(state => ({ ...state, ...operations, business }));
      setDetail(undefined); setCheckout(undefined); editorChanged.current = false;
      setReadVersion(value => value + 1); setBillRetry(value => value + 1);
      setMessage('Latest restaurant data loaded.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh.'); }
    finally { mutationLock.current = false; setSaving(false); }
  }
  function protectNavigation(action: () => void) {
    if (!editorChanged.current) { action(); return; }
    pendingNavigation.current = action;
    setDrawer(false);
    setConfirmation('leave');
  }
  function switchRole(next: Role) {
    if (next === role) return;
    setRole(next); setActorId(''); setDetail(undefined); setCheckout(undefined); setGuestEditor(undefined);
    setDrawer(false); setSearch(false); setConfirmation(undefined);
    router.replace('/overview');
    window.scrollTo({ top: 0 });
    setMessage('Viewing as ' + next);
  }
  function event(action: string, detail?: string): OrderEvent {
    return { id: crypto.randomUUID(), at: new Date().toISOString(), actor: userName, action, detail };
  }
  function startOrder(table = '', kind: Visit['kind'] = 'Dine-in', phone = false) {
    if (!table && kind === 'Dine-in' && !phone) { setStartOptions(true); return; }
    newOrderId.current = crypto.randomUUID();
    const order = { ...emptyVisit(role, table), taxRate: database.business.taxRate, kind, date: serviceDay(), status: 'Draft' as const, staffId: currentActor?.id,
      source: phone ? 'Phone pre-order' as const : 'Walk-in' as const,
      covers: kind === 'Parcel' ? 0 : Math.min(2, database.tables.find(item => item.id === table)?.seats ?? 2),
      seatedAt: table && !phone ? localTime() : '' };
    go('Orders'); setDetail({ kind: 'order', order }); setStartOptions(false);
  }
  function openOrder(order: Visit, atDesk = false) {
    if (order.status === 'Billed') {
      const bill = database.bills.find(item => item.order.id === order.id);
      if (bill) viewBill(bill);
      return;
    }
    if (!activeOrder(order)) return;
    go(atDesk ? 'Billing desk' : 'Orders');
    setDetail({ kind: 'order', order: { ...order } });
  }
  function viewBill(bill: Bill) {
    if (connected) { viewBillId(bill.id); return; }
    go('Bills'); setDetail({ kind: 'bill', id: bill.id });
  }
  function viewBillId(id: string) {
    if (!connected) return;
    historyRequest.current?.abort();
    const stayOnCustomer = page === 'Customers' && detail?.kind === 'guest';
    const stay = stayOnCustomer || ['Bills', 'Reports', 'Payments', 'Activity', 'Overview'].includes(page);
    const query = stay ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
    query.set('bill', id);
    internalNavigation.current = !stay && pathname !== '/bills';
    router.push((stay ? pathname : '/bills') + '?' + query.toString(), { scroll: true });
    if (!stayOnCustomer) setDetail(undefined);
    setSearch(false); setCheckout(undefined);
  }
  function closeBill() {
    const query = new URLSearchParams(searchParams.toString()); query.delete('bill');
    router.replace(pathname + (query.size ? '?' + query.toString() : ''), { scroll: false });
    if (detail?.kind !== 'guest') setDetail(undefined);
  }
  async function openHistoryOrder(id: string) {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    const requestedAt = historyLocation.current;
    try {
      const result = await workspaceRequest('order?' + new URLSearchParams({ id }), { signal: controller.signal });
      if (controller.signal.aborted || historyRequest.current !== controller || historyLocation.current !== requestedAt) return;
      if (result.billId) { protectNavigation(() => viewBillId(result.billId)); return; }
      if (!activeOrder(result.order)) { setMessage('This order is closed. Its changes remain available in Activity.'); return; }
      protectNavigation(() => {
        update(state => ({ ...state, orders: putOrder(state, result.order) }));
        openOrder(result.order, true);
      });
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not open order.'); }
  }
  function selectGuest(guest?: Guest) {
    go('Customers');
    if (guest) setDetail({ kind: 'guest', id: guest.id });
  }
  function visitError(visit: Visit, billing = false) {
    if (visit.id && !database.orders.some(order => order.id === visit.id && activeOrder(order))) return 'This order has already been closed.';
    if (billing && !visit.items.length) return 'Add a dish before billing.';
    if (billing && visit.kind !== 'Parcel' && !visit.table) return 'Choose a table before issuing this dine-in bill.';
    const table = database.tables.find(item => item.id === visit.table);
    if (visit.kind !== 'Parcel' && visit.table && !table) return 'Choose an existing table.';
    if (table && visit.kind !== 'Parcel' && visit.covers + (visit.extraCovers ?? 0) > table.seats) return 'Choose a table with enough seats.';
    if (table && !visit.guestLeftAt && (billing || visit.status !== 'Upcoming') && database.orders.some(order => order.id !== visit.id && order.table === visit.table && occupiesTable(order))) return 'This table already has an active order.';
    if (table && visit.status === 'Upcoming' && database.orders.some(order => order.id !== visit.id && order.table === visit.table && order.status === 'Upcoming' && order.date === visit.date && order.time === visit.time)) return 'This table already has a pre-order at that time.';
  }
  function putOrder(state: Database, visit: Visit) {
    return state.orders.some(order => order.id === visit.id) ? state.orders.map(order => order.id === visit.id ? visit : order) : [visit, ...state.orders];
  }
  function assignId(visit: Visit) {
    const orderIds = database.orders.filter(order => /^OR-\d+$/.test(order.id)).map(order => Number(order.id.slice(3)));
    return visit.id ? visit : { ...visit, id: 'OR-' + String(Math.max(0, ...orderIds) + 1).padStart(3, '0') };
  }
  async function record(visit: Visit, action?: string, type: 'save' | 'depart' | 'unpaid' | 'log' = 'save'): Promise<Visit> {
    if (connected) {
      const result = await requestMutation('orders', { type, order: visit, ...(!visit.id ? { requestId: newOrderId.current || (newOrderId.current = crypto.randomUUID()) } : {}), action: action ?? 'Order saved' });
      update(state => ({ ...state, orders: putOrder(state, result.order) }));
      editorChanged.current = false;
      return result.order;
    }
    const previous = database.orders.find(item => item.id === visit.id);
    const events = [...(previous?.events ?? [])];
    if (!previous) events.push(event('Order created', visit.table ? tableName(database, visit.table) : visit.kind ?? 'Dine-in'));
    if (previous && previous.table !== visit.table) events.push(event('Table changed', (previous.table ? tableName(database, previous.table) : 'Unassigned') + ' → ' + (visit.table ? tableName(database, visit.table) : 'Unassigned')));
    if (previous && previous.staffId !== visit.staffId) events.push(event('Order handed off', database.staff.find(staff => staff.id === visit.staffId)?.name ?? 'Unassigned'));
    for (const line of visit.items) {
      const oldLine = previous?.items.find(item => item.id === line.id);
      if (line.priceReason && (oldLine?.price !== line.price || oldLine?.priceReason !== line.priceReason)) {
        events.push(event(!oldLine && line.id.startsWith('special-') ? 'Special dish added' : 'Price changed',
          line.name + ' · ' + (oldLine ? '₹' + (oldLine.price / 100).toFixed(2) + ' → ' : '') + '₹' + (line.price / 100).toFixed(2) + ' each · ' + line.priceReason));
      }
      if (oldLine && oldLine.quantity !== line.quantity) events.push(event('Quantity corrected', line.name + ' · ' + oldLine.quantity + ' → ' + line.quantity));
    }
    for (const line of previous?.items ?? []) if (!visit.items.some(item => item.id === line.id)) events.push(event('Dish removed', line.name));
    if (visit.guestDetails !== previous?.guestDetails && visit.guestDetails && visit.guestDetails !== 'Pending') events.push(event('Guest details ' + visit.guestDetails.toLowerCase()));
    if (previous?.advance?.amount !== visit.advance?.amount || previous?.advance?.method !== visit.advance?.method) events.push(event(visit.advance ? 'Advance recorded' : 'Advance removed', visit.advance && visit.advance.method + ' · ₹' + visit.advance.amount / 100));
    if (action) events.push(event(action));
    const saved = { ...assignId(visit), taxRate: visit.taxRate ?? database.business.taxRate, updatedAt: new Date().toISOString(), events };
    update(state => ({ ...state, orders: putOrder(state, saved) }));
    editorChanged.current = false;
    return saved;
  }
  async function saveOrder(visit: Visit) {
    const error = visitError(visit);
    if (error) return error;
    const saved = await record(visit, visit.status === 'Draft' ? 'Draft saved' : visit.status === 'Upcoming' ? 'Pre-order saved' : 'Order saved');
    go(page === 'Billing desk' ? 'Billing desk' : 'Orders'); setMessage(saved.id + ' saved.');
  }
  async function progress(visit: Visit, action: 'taken' | 'served' | 'left' | 'ready' | 'draft') {
    const now = new Date().toISOString();
    if (action !== 'draft' && !visit.items.length) return 'Add a dish first.';
    const updated = { ...visit };
    if (action === 'draft' && !visit.id) updated.status = 'Draft';
    if (action === 'taken') { updated.status = 'Open'; updated.takenAt ??= now; }
    if (updated.kind !== 'Parcel' && ['taken', 'served', 'ready'].includes(action) && !updated.table) return 'Choose the dining table before starting service.';
    if (action === 'served') {
      updated.status = 'Open'; updated.takenAt ??= now; updated.servedAt = now;
      updated.items = updated.items.map(line => ({ ...line, servedQuantity: line.quantity }));
    }
    if (action === 'left') {
      if (database.orders.find(order => order.id === visit.id)?.guestLeftAt) return 'Departure has already been recorded.';
      updated.guestLeftAt ??= now;
      updated.readyForBilling = true;
    }
    if (action === 'ready') { updated.readyForBilling = true; updated.status = 'Open'; updated.takenAt ??= now; }
    const error = visitError(updated);
    if (error) return error;
    const labels = { taken: 'Order taken', served: updated.kind === 'Parcel' ? 'Packed for pickup' : 'Food served', left: updated.kind === 'Parcel' ? 'Parcel collected' : 'Guest left', ready: 'Sent to billing desk', draft: 'Draft saved' };
    const saved = await record(updated, labels[action], action === 'left' ? 'unpaid' : 'save');
    if (action === 'ready') go('Billing desk');
    else if (action === 'draft') go(page === 'Billing desk' ? 'Billing desk' : 'Orders');
    else setDetail({ kind: 'order', order: saved });
    setMessage(labels[action] + '.');
  }
  async function startCheckout(visit: Visit) {
    const error = visitError(visit, true);
    if (error) return error;
    const saved = await record(visit);
    issueLock.current = false;
    setDetail({ kind: 'order', order: saved });
    setCheckout(saved);
  }
  async function changePayments(payments: Payment[]) {
    if (!checkout) return;
    const previous = checkout.payments ?? [];
    const changed = payments.length > previous.length ? payments.at(-1) : previous.find(payment => !payments.includes(payment));
    const saved = await record({ ...checkout, payments }, changed ? (payments.length > previous.length ? 'Payment recorded' : 'Payment removed') + ' · ' + changed.method + ' · ₹' + changed.amount / 100 : undefined);
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  async function changeTip(tip: number, payments?: Payment[]) {
    if (!checkout) return;
    const saved = await record({ ...checkout, tip, ...(payments ? { payments } : {}) },
      (tip ? 'Tip set · ₹' + tip / 100 : 'Tip removed') + (payments ? ' · Payment recorded · ' + payments.at(-1)?.method + ' · ₹' + (payments.at(-1)!.amount / 100) : ''));
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  async function changeDiscount(input?: Pick<Discount, 'kind' | 'value' | 'reason'>, approve = false) {
    if (!checkout) return 'Open checkout first.';
    if (approve && role !== 'Owner') return 'Only the owner can approve this discount.';
    const { subtotal } = totals(checkout.items, database.business.taxRate);
    let discount: Discount | undefined;
    if (input) {
      const reason = input.reason.trim();
      const saving = discountAmount(input, subtotal);
      if (!reason || !Number.isFinite(input.value) || input.value <= 0 || saving < 1 || saving > subtotal
        || (input.kind === 'percent' && input.value > 100)) return 'Enter a reason and a discount greater than zero and no higher than the subtotal.';
      if (approve && (!checkout.discount?.pending || checkout.discount.subtotal !== subtotal)) return 'Review the discount against the current dish prices and submit it again.';
      const limit = database.business.staffDiscountLimit ?? defaultStaffDiscountLimit;
      const needsApproval = saving * 100 > subtotal * limit;
      discount = { ...input, reason, subtotal, pending: needsApproval && role !== 'Owner', approver: needsApproval && role === 'Owner' ? userName : undefined };
      if (payable({ ...checkout, discount: { ...discount, pending: false } }, database.business.taxRate) < (checkout.advance?.amount ?? 0) + sumPayments(checkout.payments ?? [])) {
        return 'Correct recorded payments or the advance before applying this discount.';
      }
    }
    const saved = await record({ ...checkout, discount }, discount ? (discount.pending ? 'Discount requested' : discount.approver ? 'Discount approved' : 'Discount applied') + ' · ₹' + (discountAmount(discount, subtotal) / 100).toFixed(2) + ' · ' + discount.reason : 'Discount removed');
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  async function changeCheckoutLine(line: Line) {
    if (!checkout) return 'Open checkout first.';
    const items = checkout.items.map(item => item.id === line.id ? line : item);
    const next = { ...checkout, items };
    if (payable(next, database.business.taxRate) < (checkout.advance?.amount ?? 0) + sumPayments(checkout.payments ?? [])) {
      return 'The new total is below the amount already recorded. Correct the payment or advance first.';
    }
    const saved = await record(next);
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  async function completeBill(payments: Payment[]) {
    if (!checkout || issueLock.current) return 'The bill has already been processed.';
    const error = visitError(checkout, true);
    if (error) return error;
    if (checkout.discount && (checkout.discount.pending || checkout.discount.subtotal !== totals(checkout.items, database.business.taxRate).subtotal)) return 'Resolve the discount before issuing the bill.';
    if (sumPayments(payments) + (checkout.advance?.amount ?? 0) !== payable(checkout, database.business.taxRate)) return 'Record the full balance before issuing the bill.';
    issueLock.current = true;
    if (connected) {
      try {
        const result = await requestMutation('orders', { type: 'issue', order: { ...checkout, payments }, action: 'Checkout completed' });
        const bill = result.bill as Bill;
        update(state => ({ ...state, orders: putOrder(state, result.order), bills: [bill, ...state.bills.filter(item => item.id !== bill.id)] }));
        setCheckout(undefined); viewBill(bill); setMessage('Bill ' + bill.id + ' issued.');
      } finally { issueLock.current = false; }
      return;
    }
    const id = 'SR-' + (Math.max(0, ...database.bills.map(bill => Number(bill.id.slice(3)))) + 1);
    const now = new Date().toISOString();
    const customer = database.guests.find(guest => guest.id === checkout.guestId);
    const order: Visit = { ...checkout, guestPhone: checkout.guestPhone || customer?.phone, payments, status: 'Billed', takenAt: checkout.takenAt ?? now, updatedAt: now, events: [...(checkout.events ?? []), event('Bill issued', id)] };
    const bill: Bill = { id, order, date: serviceDay(), time: localTime(), payments, taxRate: order.taxRate ?? database.business.taxRate, business: { ...database.business }, tableName: order.table ? tableName(database, order.table) : undefined };
    update(state => ({ ...state, orders: putOrder(state, order), bills: [bill, ...state.bills] }));
    setCheckout(undefined); viewBill(bill); setMessage('Bill ' + id + ' issued.');
  }
  async function closeVisit(requested: Visit) {
    const visit = database.orders.find(item => item.id === requested.id);
    if (!visit || visit.guestLeftAt || visit.status !== 'Billed') return;
    const now = new Date().toISOString();
    await record({ ...visit, guestLeftAt: now }, visit.kind === 'Parcel' ? 'Parcel collected' : 'Guest left', 'depart');
    setMessage(visit.kind === 'Parcel' ? 'Parcel collected.' : 'Guest departure recorded.');
  }
  function logBillAction(bill: Bill, action: string) {
    const visit = database.orders.find(item => item.id === bill.order.id);
    if (visit) void record(visit, action, 'log').catch(error => setMessage(error.message));
  }
  const syncQueue = useRef(Promise.resolve());
  const syncAttempts = useRef(new Map<string, number>());
  function syncGuest(guest: Guest) {
    if (connected) {
      void contactRequest('sync', { id: guest.id }).then(result => {
        if (result.synced !== true) throw new Error('Google did not confirm contact sync.');
        update(state => ({ ...state, guests: state.guests.map(item => item.id === guest.id && item.revision === guest.revision ?
          { ...item, sync: 'Synced', syncConfirmedAt: result.syncConfirmedAt, syncIssue: undefined } : item) }));
        setMessage('Customer saved to Google Contacts.');
      }).catch(error => {
        update(state => ({ ...state, guests: state.guests.map(item => item.id === guest.id && item.revision === guest.revision ?
          { ...item, sync: 'Sync pending', syncIssue: error.message } : item) }));
        setMessage('Customer saved. ' + error.message);
      });
      return;
    }
    if (isSampleGuest(guest.id)) { setMessage('Sample contacts stay in the demo. Add a new customer to test Google sync.'); return; }
    const contacts = [...(guest.phone ? [{ id: guest.id, name: guest.name, phone: guest.phone, note: guest.contactNote ?? '' }] : []),
      ...guest.companions.flatMap(person => person.saveToGoogle && person.id ? [{ id: person.id, name: person.name, phone: person.phone, note: '' }] : [])];
    if (!contacts.length) return;
    const attempt = (syncAttempts.current.get(guest.id) ?? 0) + 1;
    syncAttempts.current.set(guest.id, attempt);
    const current = () => syncAttempts.current.get(guest.id) === attempt;
    const finish = (issue?: string) => {
      if (!current()) return;
      update(state => ({ ...state, guests: state.guests.map(item => item.id === guest.id ? { ...item,
        sync: issue ? 'Sync pending' : 'Synced', syncConfirmedAt: issue ? undefined : new Date().toISOString(), syncIssue: issue,
      } : item) }));
      setMessage(issue ? 'Customer saved. ' + issue : 'Customer saved to Google Contacts.');
    };
    if (!database.business.contactSync) { finish('Automatic contact sync is off in Settings.'); return; }
    if (new Set(contacts.map(contact => contact.phone)).size !== contacts.length ||
      contacts.some(contact => database.guests.some(item => item.id !== guest.id && item.phone === contact.phone))) {
      finish('This number is shared. Review the contact details before syncing.'); return;
    }
    syncQueue.current = syncQueue.current.catch(() => {}).then(async () => {
      if (!current()) return;
      try {
        for (const contact of contacts) {
          if (!current()) return;
          const result = await contactRequest('sync', contact);
          if (result.synced !== true) throw new Error('Google did not confirm the save. Retry contact sync.');
        }
        finish();
      } catch (error) { finish(error instanceof Error ? error.message : 'Contact sync failed. Try again.'); }
    });
  }
  async function saveGuest(guest: Guest): Promise<string | void> {
    if (connected) {
      try { guest = (await workspaceRequest('customers', { method: 'POST', body: JSON.stringify(guest) })).customer; }
      catch (error) { return error instanceof Error ? error.message : 'Could not save customer.'; }
      setCustomerRefresh(value => value + 1);
    }
    if (guest.companions.some(person => person.saveToGoogle)) guest = { ...guest, sync: 'Sync pending' };
    update(state => ({ ...state, guests: state.guests.some(item => item.id === guest.id) ? state.guests.map(item => item.id === guest.id ? guest : item) : [guest, ...state.guests] }));
    if (guestEditor?.linkBilled) setCustomerLink(current => current ? { ...current, guest } : current);
    else if (guestEditor?.inOrder && detail?.kind === 'order') setDetail({ kind: 'order', order: { ...detail.order, guestId: guest.id, guest: guest.name, guestPhone: guest.phone, guestDetails: 'Collected' } });
    else selectGuest(guest);
    setGuestEditor(undefined);
    if (isSampleGuest(guest.id)) { setMessage('Sample customer saved. Add a new customer to test Google sync.'); return; }
    setMessage(guest.sync === 'Sync pending' ? 'Customer saved. Contact sync pending.' : 'Customer saved.');
    if (guest.sync === 'Sync pending' && database.business.contactSync) syncGuest(guest);
    else syncAttempts.current.set(guest.id, (syncAttempts.current.get(guest.id) ?? 0) + 1);
  }
  const order = detail?.kind === 'order' ? detail.order : undefined;
  const latestOrder = order?.id ? data.orders.find(item => item.id === order.id) : undefined;
  const orderChangedElsewhere = Boolean(connected && order?.id && latestOrder?.revision !== order.revision);
  const bill = connected ? data.bills.find(item => item.id === selectedBillId) : detail?.kind === 'bill' ? data.bills.find(item => item.id === detail.id) : undefined;
  const guest = detail?.kind === 'guest' ? data.guests.find(item => item.id === detail.id) : undefined;
  const actors = database.staff.filter(staff => staff.role === role && staff.active);
  const currentActor = connected ? database.staff.find(member => member.id === connected.user.id) : actors.find(staff => staff.id === actorId) ?? actors[0];
  const userName = currentActor?.name ?? sessionProfile[role] ?? roleNames[role];
  const initials = userName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const searchTerm = query.trim().toLowerCase();
  const searchPages = allowed.filter(item => (item === 'Menu' ? 'menu food pricing' : item.toLowerCase()).includes(searchTerm));
  const searchOrders = searchTerm ? data.orders.filter(item => activeOrder(item) && (item.id + ' ' + guestLabel(item)).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  const searchBills = searchTerm ? data.bills.filter(item => (item.id + ' ' + guestLabel(item.order)).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  const searchGuests = searchTerm ? data.guests.filter(item => (item.name + ' ' + item.phone).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  function rememberCustomer(guest: Guest) {
    update(state => ({ ...state, guests: [...state.guests.filter(item => item.id !== guest.id), guest] }));
  }

  let body;
  if (selectedBillId && (billLoad?.id !== selectedBillId || !billLoad.loaded || !bill)) body = <section className="panel ch-state">
    {billLoad?.id === selectedBillId && billLoad.error ? <><p className="error" role="alert">{billLoad.error}</p><button className="btn primary" onClick={() => setBillRetry(value => value + 1)}>Retry bill</button></> : <p role="status">Loading bill…</p>}
    <button className="btn secondary" onClick={closeBill}>Back to {page === 'Menu' ? 'Food & pricing' : page.toLowerCase()}</button>
  </section>;
  else if (order && (page === 'Orders' || page === 'Billing desk')) body = <>
    {orderChangedElsewhere && <p className="workspace-stage" role="status">This order changed on another device. Your edits are still here. Return to the order list and reopen it to get the latest version.</p>}
    <OrderEditor key={order.id || 'new'} order={order} connected={Boolean(connected)} rememberCustomer={rememberCustomer} update={value => { editorChanged.current = true; setDetail({ kind: 'order', order: value }); }} data={data} atBillingDesk={page === 'Billing desk'} staff={data.staff.filter(member => member.active)} onProgress={safely(progress)} cancel={() => protectNavigation(() => go(page === 'Billing desk' ? 'Billing desk' : 'Orders'))} save={safely(saveOrder)} checkout={safely(startCheckout)} addGuest={() => setGuestEditor({ inOrder: true })} />
    {order.id && <button className="btn secondary order-admin" onClick={() => setConfirmation('cancel')}>Cancel saved order</button>}
  </>;
  else if (bill && (page === 'Bills' || Boolean(selectedBillId))) {
    const visit = database.orders.find(item => item.id === bill.order.id);
    const awaitingDeparture = visit?.status === 'Billed' && visit.takenAt && !visit.guestLeftAt;
    body = <BillPreview key={bill.id} bill={bill} refunds={data.refunds} table={bill.tableName ?? (bill.order.table ? tableName(database, bill.order.table) : '')} close={connected ? closeBill : () => go('Bills')} backLabel={connected ? 'Back to ' + page.toLowerCase() : 'Bills'} canVoid={role === 'Owner'} onVoid={() => { refundLock.current = false; setRefundBill(bill); }} onShare={event => logBillAction(bill, event.channel + ' share ' + event.action)} onDeparture={awaitingDeparture ? () => setDeparture(visit) : undefined} />;
  }
  else switch (page) {
    case 'Overview': body = connected ? <ConnectedOverview data={data} role={role} refresh={readVersion} onBill={viewBillId} openOrder={openOrder} newOrder={() => startOrder()} go={go} /> : <Dashboard data={data} role={role} open={openOrder} newOrder={() => startOrder()} viewBill={viewBill} go={go} />; break;
    case 'Dining tables': body = <Dining data={data} role={role} allOrders={database.orders} update={updateCatalog} open={openOrder} start={startOrder} startParcel={() => startOrder('', 'Parcel')} notify={setMessage} depart={setDeparture} />; break;
    case 'Orders': body = <Orders data={data} historyLimited={Boolean(connected)} open={openOrder} start={() => startOrder()} bill={viewBill} onLinkCustomer={connected && role === 'Owner' ? order => setCustomerLink({ order }) : undefined} />; break;
    case 'Billing desk': body = <BillingDesk data={data} viewHistory={connected ? () => go('Bills') : undefined} open={visit => openOrder(visit, true)} view={viewBill} closeVisit={safely(closeVisit)} startParcel={() => startOrder('', 'Parcel')} />; break;
    case 'Activity': body = connected ? <ConnectedHistory resource="activity" role={role} refresh={readVersion} onBill={viewBillId} onOrder={id => void openHistoryOrder(id)} /> : <Activity data={data} />; break;
    case 'Bills': body = connected ? <ConnectedHistory resource="bills" role={role} refresh={readVersion} onBill={viewBillId} onOrder={id => void openHistoryOrder(id)} /> : <><Title title="Bills" subtitle={'Find, reprint and share issued restaurant bills.'} /><BillList bills={data.bills} refunds={data.refunds} view={viewBill} /></>; break;
    case 'Payments': body = connected ? <ConnectedHistory resource="payments" role={role} refresh={readVersion} onBill={viewBillId} onOrder={id => void openHistoryOrder(id)} /> : <Payments data={data} view={viewBill} />; break;
    case 'Customers': body = <>{connected && !guest ? <ConnectedCustomers refresh={customerRefresh} canExport={role === 'Owner'} add={() => setGuestEditor({})} select={value => { rememberCustomer(value); selectGuest(value); }} /> :
      <Customers data={data} role={role} selected={guest} select={selectGuest} edit={async value => {
        if (connected) {
          try { value = (await workspaceRequest('customers/' + value.id)).customer; rememberCustomer(value); }
          catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load customer.'); return; }
        }
        setGuestEditor({ guest: value });
      }} add={() => setGuestEditor({})} viewBill={viewBill} retry={syncGuest}
        previousBills={connected && guest ? <ConnectedCustomerBills key={guest.id} customerId={guest.id} onBill={viewBillId} /> : undefined} viewHistory={connected ? customer => {
        const today = serviceDay();
        router.push('/bills?' + new URLSearchParams({ customer: customer.id, from: role === 'Staff' ? today : today.slice(0, 8) + '01', to: today }));
        setDetail(undefined);
      } : undefined} />}{!guest && <GoogleContactsAccess ownerView={role === 'Owner'} />}</>; break;
    case 'Menu': body = <Menu data={data} role={role} update={updateCatalog} notify={setMessage} />; break;
    case 'Reports': body = connected ? <ConnectedHistory resource="sales" role={role} refresh={readVersion} onBill={viewBillId} onOrder={id => void openHistoryOrder(id)} /> : <Reports data={data} viewBill={viewBill} openOrder={order => openOrder(order, true)} />; break;
    case 'Staff & access': body = connected ? <ConnectedTeam currentId={connected.user.id} /> : <StaffAccess data={data} update={update} notify={setMessage} />; break;
    case 'Settings': body = <>{role === 'Owner' ? <><Settings business={data.business} update={update} notify={setMessage} persist={connected ? async business => {
      const result = await workspaceRequest('business', { method: 'POST', body: JSON.stringify({ ...business, revision: business.revision ?? 0 }) });
      return result.business;
    } : undefined} /><GoogleContactsAccess ownerView /></> : <Title title="Settings" subtitle="Manage this device and your session." />}
      <section className="panel settings-panel account-settings" aria-labelledby="account-actions-title">
        <h2 id="account-actions-title">Device and session</h2>
        <div className="title-actions"><InstallApp {...appInstallation} />
          {connected && <button className="btn secondary" onClick={() => protectNavigation(() => { void onSignOut?.().catch(() => setMessage('Could not sign out. Retry.')); })}><LogOut size={17} aria-hidden="true" /> Sign out</button>}
        </div>
      </section>
    </>; break;
    case 'My profile': body = <><Title title="My profile" subtitle="Manage your display name and see your current role." /><form className="panel settings-panel" key={role} onSubmit={async event => {
      event.preventDefault();
      const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
      if (!name) { setMessage('Enter a display name.'); return; }
      if (connected) {
        try {
          await requestMutation('profile', { name });
          update(state => ({ ...state, staff: state.staff.map(member => member.id === connected.user.id ? { ...member, name } : member) }));
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save profile.'); return; }
      }
      setSessionProfile(state => ({ ...state, [role]: name })); setMessage('Profile saved.');
    }}><Field label="Display name"><input name="name" required defaultValue={sessionProfile[role] ?? userName} /></Field><Field label="Current role"><input value={role} readOnly /></Field><button className="btn primary">Save profile</button></form></>; break;
  }

  return <div className="workspace">
    {!drawer && <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>}
    {drawer && <button className="drawer-scrim" tabIndex={-1} aria-label="Close navigation overlay" onClick={() => setDrawer(false)} />}
    <aside id="workspace-sidebar" ref={sidebar} className={'sidebar ' + (drawer ? 'drawer-open' : '')} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-labelledby={drawer ? 'workspace-more-title' : undefined}>
      {drawer && <button className="icon-button drawer-close" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={20} /></button>}
      {drawer ? <div className="more-sheet-head"><span aria-hidden="true" /><h2 id="workspace-more-title">More</h2><p>Sweet Rascal · {role} workspace</p></div> :
        <button className="brand-button" onClick={() => protectNavigation(() => go('Overview'))} aria-label="Sweet Rascal overview"><Brand /></button>}
      <nav aria-label="Main navigation">{navigation.map(group => <div className="nav-group" key={group.label}>
        <p>{group.label}</p>{group.pages.filter(item => allowed.includes(item) && (!drawer || !quickPages.some(quick => quick === item))).map(item => { const Icon = icons[item]; return <Link prefetch={false} href={pagePaths[item]} key={item} className={page === item ? 'nav-active' : ''} aria-current={page === item ? 'page' : undefined} onClick={event => navigateLink(event, item)}><Icon size={18} aria-hidden="true" />{item === 'Menu' ? 'Food & pricing' : item}</Link>; })}
      </div>)}</nav>
    </aside>
    <div className="workspace-body" inert={drawer}>
      <header className="topbar"><div className="breadcrumb"><button className="mobile-brand" aria-label="Sweet Rascal overview" onClick={() => protectNavigation(() => go('Overview'))}><HeartMark width={23} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{page === 'Menu' ? 'Food & pricing' : page}</strong></div>
        <div className="top-actions">{connected && <button className="icon-button" disabled={saving} aria-label="Refresh restaurant data" onClick={() => protectNavigation(() => { void refreshWorkspace(); })}><RefreshCw size={18} aria-hidden="true" /></button>}{!connected && actors.length > 1 && <select className="actor-select" aria-label="Staff member" value={currentActor?.id} onChange={e => setActorId(e.target.value)}>{actors.map(staff => <option value={staff.id} key={staff.id}>{staff.name}</option>)}</select>}<button className="icon-button top-search" onClick={() => { setSearch(true); setQuery(''); }} aria-label="Search workspace"><Search size={19} /></button>{connected ? <span className="badge gray">{role}</span> : <label className="role-switch"><ShieldCheck size={16} /><span>Preview as</span><select value={role} aria-label="Preview as role" onChange={event => { const next = event.target.value as Role; protectNavigation(() => switchRole(next)); }}>{roles.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>}<Link href={pagePaths['My profile']} className="icon-button header-profile" aria-current={page === 'My profile' ? 'page' : undefined} aria-label={`My profile, ${userName}, ${role}`} title="My profile" onClick={event => navigateLink(event, 'My profile')}><span className="avatar" aria-hidden="true">{initials}</span></Link></div>
      </header>
      <main className="main-content" id="main" tabIndex={-1}>{!connected && <p className="workspace-stage" role="status">Demo workspace · Sample data is saved in this browser only. Configure MongoDB to use shared restaurant data.</p>}{saving && <p className="workspace-stage" role="status">Saving to restaurant database…</p>}<WorkspaceContentContext.Provider value={allowed.includes(page) ? body : <Empty title="This page is restricted" />}>{children}</WorkspaceContentContext.Provider></main>
      <nav className="mobile-nav" aria-label="Quick navigation">
        {quickPages.map(item => { const Icon = icons[item]; return <Link prefetch={false} href={pagePaths[item]} key={item} aria-current={page === item ? 'page' : undefined} onClick={event => navigateLink(event, item)}><Icon size={20} aria-hidden="true" />{item === 'Dining tables' ? 'Tables' : item === 'Billing desk' ? 'Billing' : item}</Link>; })}
        <button ref={moreButton} onClick={() => setDrawer(!drawer)} aria-haspopup="dialog" aria-expanded={drawer} aria-controls="workspace-sidebar"><Ellipsis size={20} aria-hidden="true" /> More</button>
      </nav>
    </div>
    {message && <div className="toast" role="status"><CheckCircle2 size={20} /><span>{message}</span><button aria-label="Dismiss notification" className="icon-button" onClick={() => setMessage('')}><X size={16} /></button></div>}
    {guestEditor && <GuestEditor guest={guestEditor.guest} guests={database.guests} role={role} sync={database.business.contactSync} save={saveGuest} close={() => setGuestEditor(undefined)} />}
    {customerLink && !guestEditor && <Dialog title="Link customer to billed order" description={customerLink.order.id} close={() => { if (!saving) setCustomerLink(undefined); }}>
      <p>This adds the visit to the customer’s history. The issued invoice keeps its original details and amounts. Confirm the customer before linking. This link can only be made once.</p>
      <Form label="Link customer" close={() => setCustomerLink(undefined)} onSave={async () => {
        if (!customerLink.guest) return 'Choose an existing customer or add a new one.';
        const result = await requestMutation('link-billed-customer', { orderId: customerLink.order.id, customerId: customerLink.guest.id });
        update(state => ({ ...state, orders: putOrder(state, result.order) }));
        setCustomerLink(undefined); setMessage('Customer linked to the order.');
      }}>
        <CustomerSearch guests={data.guests} connected selected={customerLink.guest} onSelect={guest => setCustomerLink(current => current ? { ...current, guest } : current)} />
        <button type="button" className="btn secondary" onClick={() => setGuestEditor({ linkBilled: true })}>Add new customer</button>
      </Form>
    </Dialog>}
    {checkout && <Checkout order={checkout} taxRate={database.business.taxRate} role={role} staffDiscountLimit={database.business.staffDiscountLimit ?? defaultStaffDiscountLimit} close={() => setCheckout(undefined)} complete={safely(completeBill)} onPaymentsChange={safely(changePayments)} onTipChange={safely(changeTip)} onDiscountChange={safely(changeDiscount)} onLineChange={safely(changeCheckoutLine)} />}
    {refundBill && <RefundDialog bill={refundBill} refunds={database.refunds ?? []} close={() => setRefundBill(undefined)} save={async input => {
      if (refundLock.current || role !== 'Owner') return 'This refund cannot be recorded.';
      const original = database.bills.find(item => item.id === refundBill.id);
      if (!original || original.voided) return 'Open an active bill to refund.';
      if (connected) {
        try {
          const result = await requestMutation('refunds', { ...input, id: input.requestId ?? crypto.randomUUID(), billId: original.id });
          update(state => ({ ...state, ...(result.order ? { orders: putOrder(state, result.order) } : {}), refunds: [...(state.refunds ?? []).filter(item => item.id !== result.refund.id), result.refund] }));
          setRefundBill(undefined); setMessage('Refund recorded.'); return;
        } catch (error) { return error instanceof Error ? error.message : 'Could not save refund.'; }
      }
      const refunds = database.refunds ?? [];
      const previous = refunds.filter(item => item.billId === original.id);
      const remaining = Math.min(payable(original.order, original.taxRate), (original.order.advance?.amount ?? 0) + sumPayments(original.payments)) - refundTotal(refunds, original.id);
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > remaining || !input.reason.trim()) return 'Check the refund amount and reason.';
      if (input.cancelled && input.amount !== remaining) return 'Refund the remaining amount before cancelling the bill.';
      const originalTotals = totals(original.order.items, original.taxRate, original.order.discount);
      const salesRemaining = Math.max(0, originalTotals.total - previous.reduce((sum, refund) => sum + refund.salesAmount, 0));
      const taxRemaining = Math.max(0, originalTotals.tax * 2 - previous.reduce((sum, refund) => sum + refund.taxAmount, 0));
      const salesAmount = Math.min(input.amount, salesRemaining);
      const refund = { ...input, id: 'refund-' + crypto.randomUUID(), billId: original.id, salesAmount,
        taxAmount: salesRemaining ? Math.round(taxRemaining * salesAmount / salesRemaining) : 0,
        tipAmount: input.amount - salesAmount, at: new Date().toISOString(), actor: userName };
      refundLock.current = true;
      update(state => ({ ...state, refunds: [...(state.refunds ?? []), refund] }));
      logBillAction(original, (input.cancelled ? 'Bill cancelled and refunded' : 'Refund recorded') + ' · ₹' + input.amount / 100 + ' · ' + input.reason);
      setRefundBill(undefined); setMessage('Refund recorded.');
    }} />}
    {departure && <Dialog title={departure.kind === 'Parcel' ? 'Mark parcel collected?' : 'Confirm guests have left'} close={() => setDeparture(undefined)}>
      <p>{departure.kind === 'Parcel' ? 'Confirm when the customer has collected their order.' : 'Confirm once the guests have left and the table is ready for the next party.'}</p>
      <div className="dialog-actions"><button className="btn secondary" onClick={() => setDeparture(undefined)}>Cancel</button><button className="btn primary" disabled={saving} onClick={async () => { const failure = await safely(closeVisit)(departure); if (!failure) setDeparture(undefined); }}>{departure.kind === 'Parcel' ? 'Mark collected' : 'Free table'}</button></div>
    </Dialog>}
    {confirmation && <Dialog title={confirmation === 'void' ? 'Void this sample bill?' : confirmation === 'cancel' ? 'Cancel this order?' : 'Leave this order?'} close={() => setConfirmation(undefined)}>
      <Form close={() => setConfirmation(undefined)} label={confirmation === 'void' ? 'Void bill' : confirmation === 'cancel' ? 'Cancel order' : 'Leave order'} danger onSave={async form => {
        const reason = String(form.get('reason') ?? '').trim();
        if (confirmation !== 'leave' && !reason) return 'Enter a reason.';
        if (confirmation === 'void' && bill && role === 'Owner') {
          update(state => ({ ...state, bills: state.bills.map(item => item.id === bill.id ? { ...item, voided: true } : item) })); logBillAction(bill, 'Bill voided · ' + reason); setMessage(bill.id + ' was voided.');
        }
        if (confirmation === 'cancel' && order?.id) {
          const stored = database.orders.find(item => item.id === order.id);
          if (stored?.advance || stored?.payments?.length) return 'This order has an advance. Resolve that payment before cancelling.';
          try { await record({ ...(stored ?? order), status: 'Cancelled' }, 'Order cancelled · ' + reason); } catch (error) { return error instanceof Error ? error.message : 'Could not cancel order.'; }
          go('Orders'); setMessage('Order cancelled.');
        }
        if (confirmation === 'leave') {
          editorChanged.current = false;
          pendingNavigation.current?.();
          pendingNavigation.current = undefined;
        }
        setConfirmation(undefined);
      }}><p className="wide">{confirmation === 'void' ? 'The original bill stays in the list with a Voided status.' : confirmation === 'cancel' ? 'This releases the table and removes the order from active service.' : 'Any changes since your last save will be lost.'}</p>{confirmation !== 'leave' && <Field label="Reason" wide><textarea name="reason" required rows={2} /></Field>}</Form>
    </Dialog>}
    {search && <Dialog title="Search workspace" close={() => setSearch(false)}><SearchInput value={query} onChange={setQuery} placeholder="Find a page, order, bill or customer…" /><div className="search-results">
      {searchPages.map(item => <button key={item} onClick={() => go(item)}>{item === 'Menu' ? 'Food & pricing' : item}<ChevronRight size={15} /></button>)}
      {searchOrders.map(item => <button key={item.id} onClick={() => openOrder(item)}>{item.id} · {guestLabel(item)}<ChevronRight size={15} /></button>)}
      {searchBills.map(item => <button key={item.id} onClick={() => viewBill(item)}>{item.id} · {guestLabel(item.order)}<ChevronRight size={15} /></button>)}
      {searchGuests.map(item => <button key={item.id} onClick={() => selectGuest(item)}>{item.name}<ChevronRight size={15} /></button>)}
      {!searchPages.length && !searchOrders.length && !searchBills.length && !searchGuests.length && <Empty title="No matching results" />}
    </div></Dialog>}
    {startOptions && <Dialog title="Take order" close={() => setStartOptions(false)}><div className="order-entry-options">
      <button className="btn primary" onClick={() => { setStartOptions(false); go('Dining tables'); }}><LayoutGrid size={18} /> Dine-in · choose a table</button>
      <button className="btn secondary" onClick={() => startOrder('', 'Parcel')}><Plus size={18} /> Parcel · no table</button>
      <button className="btn secondary" onClick={() => startOrder('', 'Dine-in', true)}><Plus size={18} /> Phone pre-order · assign later</button>
    </div></Dialog>}
    <ConnectionGuard />
  </div>;
}

