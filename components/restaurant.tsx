'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, CreditCard, LayoutDashboard, LayoutGrid, Menu as MenuIcon, Plus, ReceiptText, Search, Settings2, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { type Bill, type Database, type Guest, type OrderEvent, type Page, type Payment, type Role, type Visit, emptyVisit, initialData, occupiesTable, payable, roleNames, rolePages, roles, serviceDay, sumPayments } from '../lib/demo';
import { Brand, Dialog, Empty, Field, Form, SearchInput, Title } from './ui';
import { Checkout, OrderEditor } from './billing';
import { BillPreview } from './invoice';
import { BillingDesk, Activity } from './desk';
import { BillList, Dashboard, Reports, guestLabel, tableName } from './overview';
import { Customers, Dining, GuestEditor, Menu, Orders, Payments, Settings, StaffAccess } from './operations';

const storageKey = 'sweet-rascal-prototype-v1';
const navigation = [
  { label: 'SERVICE', pages: ['Overview', 'Dining tables', 'Orders', 'Billing desk', 'Bills', 'Payments'] },
  { label: 'MANAGE', pages: ['Customers', 'Menu', 'Reports', 'Activity', 'Staff & access', 'Settings'] },
] as { label: string; pages: Page[] }[];
const icons = {
  Overview: LayoutDashboard, 'Dining tables': LayoutGrid, Orders: ClipboardList, 'Billing desk': ReceiptText, Activity: ClipboardList, Bills: ReceiptText, Payments: CreditCard,
  Customers: Users, Menu: BookOpen, Reports: BarChart3, 'Staff & access': ShieldCheck, Settings: Settings2, 'My profile': UserRound,
};
type Detail = { kind: 'order'; order: Visit } | { kind: 'bill' | 'guest'; id: string };
const activeOrder = (order: Visit) => ['Draft', 'Open', 'Upcoming'].includes(order.status);
const localTime = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date());
const slug = (page: Page) => page.toLowerCase().replace(/ & /g, '-').replaceAll(' ', '-');

export default function Restaurant() {
  const [database, update] = useState(initialData);
  const [role, setRole] = useState<Role>('Owner');
  const [page, setPage] = useState<Page>('Overview');
  const [detail, setDetail] = useState<Detail>();
  const [guestEditor, setGuestEditor] = useState<{ guest?: Guest; inOrder?: boolean }>();
  const [checkout, setCheckout] = useState<Visit>();
  const [departure, setDeparture] = useState<Visit>();
  const [confirmation, setConfirmation] = useState<'void' | 'cancel' | 'leave'>();
  const [drawer, setDrawer] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [help, setHelp] = useState(false);
  const [sessionProfile, setSessionProfile] = useState<Partial<Record<Role, string>>>({});
  const allowed = rolePages[role];
  const data = database;
  const issueLock = useRef(false);
  const pendingNavigation = useRef<(() => void) | undefined>(undefined);
  const editorChanged = useRef(false);
  const [actorId, setActorId] = useState('');
  const [startOptions, setStartOptions] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const snapshot = JSON.parse(saved) as { database: Database; role: string; profile: Partial<Record<Role, string>> };
          if (snapshot.database?.business) {
            const nextRole = snapshot.role === 'Owner' ? 'Owner' : 'Staff';
            const normalizeOrder = (order: Visit): Visit => ({ ...order, assigned: order.assigned === 'Owner' ? 'Owner' : 'Staff' });
            update({
              ...snapshot.database,
              orders: snapshot.database.orders.map(normalizeOrder),
              bills: snapshot.database.bills.map(bill => ({ ...bill, order: normalizeOrder(bill.order) })),
              guests: snapshot.database.guests.map(guest => ({ ...guest, assigned: guest.assigned === 'Owner' ? 'Owner' : 'Staff' })),
              staff: snapshot.database.staff.map(member => ({ ...member, role: member.role === 'Owner' ? 'Owner' : 'Staff' })),
            });
            setRole(nextRole); setSessionProfile(snapshot.profile ?? {});
            const matching = rolePages[nextRole].find(item => '#' + slug(item) === location.hash);
            if (matching) setPage(matching);
          }
        } else {
          const matching = rolePages.Owner.find(item => '#' + slug(item) === location.hash);
          if (matching) setPage(matching);
        }
      } catch { /* Keep the seeded demo when storage is unavailable. */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ database, role, profile: sessionProfile })); } catch { /* Session still works in memory. */ }
  }, [database, role, ready, sessionProfile]);
  useEffect(() => {
    function handleHash() {
      setPage(rolePages[role].find(item => '#' + slug(item) === location.hash) ?? 'Overview');
      setDetail(undefined);
      setDrawer(false);
    }
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [role]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3600);
    return () => clearTimeout(timer);
  }, [message]);

  function go(next: Page) {
    if (!allowed.includes(next)) return;
    history.pushState(null, '', '#' + slug(next));
    setPage(next); setDetail(undefined); setDrawer(false); setSearch(false);
    editorChanged.current = false;
    window.scrollTo({ top: 0 });
  }
  function protectNavigation(action: () => void) {
    if (!editorChanged.current) { action(); return; }
    pendingNavigation.current = action;
    setDrawer(false);
    setConfirmation('leave');
  }
  function switchRole(next: Role) {
    if (next === role) return;
    setRole(next); setActorId(''); setPage('Overview'); setDetail(undefined); setCheckout(undefined); setGuestEditor(undefined);
    setDrawer(false); setSearch(false); setConfirmation(undefined); setHelp(false);
    history.replaceState(null, '', '#overview');
    window.scrollTo({ top: 0 });
    setMessage('Viewing as ' + next);
  }
  function event(action: string, detail?: string): OrderEvent {
    return { id: crypto.randomUUID(), at: new Date().toISOString(), actor: userName, action, detail };
  }
  function startOrder(table = '', kind: Visit['kind'] = 'Dine-in', phone = false) {
    if (!table && kind === 'Dine-in' && !phone) { setStartOptions(true); return; }
    const order = { ...emptyVisit(role, table), kind, date: serviceDay(), status: 'Draft' as const, staffId: currentActor?.id,
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
    go('Bills'); setDetail({ kind: 'bill', id: bill.id });
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
  function record(visit: Visit, action?: string) {
    const previous = database.orders.find(item => item.id === visit.id);
    const events = [...(previous?.events ?? [])];
    if (!previous) events.push(event('Order created', visit.table ? tableName(database, visit.table) : visit.kind ?? 'Dine-in'));
    if (previous && previous.table !== visit.table) events.push(event('Table changed', (previous.table ? tableName(database, previous.table) : 'Unassigned') + ' → ' + (visit.table ? tableName(database, visit.table) : 'Unassigned')));
    if (previous && previous.staffId !== visit.staffId) events.push(event('Order handed off', database.staff.find(staff => staff.id === visit.staffId)?.name ?? 'Unassigned'));
    for (const line of visit.items) {
      const oldLine = previous?.items.find(item => item.id === line.id);
      if (line.priceReason && (oldLine?.price !== line.price || oldLine?.priceReason !== line.priceReason)) {
        events.push(event(!oldLine && line.id.startsWith('special-') ? 'Special dish added' : 'Price changed', line.name + ' · ₹' + (line.price / 100) + ' · ' + line.priceReason));
      }
      if (oldLine && oldLine.quantity !== line.quantity) events.push(event('Quantity corrected', line.name + ' · ' + oldLine.quantity + ' → ' + line.quantity));
    }
    for (const line of previous?.items ?? []) if (!visit.items.some(item => item.id === line.id)) events.push(event('Dish removed', line.name));
    if (visit.guestDetails !== previous?.guestDetails && visit.guestDetails && visit.guestDetails !== 'Pending') events.push(event('Guest details ' + visit.guestDetails.toLowerCase()));
    if (previous?.advance?.amount !== visit.advance?.amount || previous?.advance?.method !== visit.advance?.method) events.push(event(visit.advance ? 'Advance recorded' : 'Advance removed', visit.advance && visit.advance.method + ' · ₹' + visit.advance.amount / 100));
    if (action) events.push(event(action));
    const saved = { ...assignId(visit), updatedAt: new Date().toISOString(), events };
    update(state => ({ ...state, orders: putOrder(state, saved) }));
    editorChanged.current = false;
    return saved;
  }
  function saveOrder(visit: Visit) {
    const error = visitError(visit);
    if (error) return error;
    const saved = record(visit, visit.status === 'Draft' ? 'Draft saved' : visit.status === 'Upcoming' ? 'Pre-order saved' : 'Order saved');
    go(page === 'Billing desk' ? 'Billing desk' : 'Orders'); setMessage(saved.id + ' saved.');
  }
  function progress(visit: Visit, action: 'taken' | 'served' | 'left' | 'ready' | 'draft') {
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
    const saved = record(updated, labels[action]);
    if (action === 'ready') go('Billing desk');
    else if (action === 'draft') go(page === 'Billing desk' ? 'Billing desk' : 'Orders');
    else setDetail({ kind: 'order', order: saved });
    setMessage(labels[action] + '.');
  }
  function startCheckout(visit: Visit) {
    const error = visitError(visit, true);
    if (error) return error;
    const saved = record(visit);
    issueLock.current = false;
    setDetail({ kind: 'order', order: saved });
    setCheckout(saved);
  }
  function changePayments(payments: Payment[]) {
    if (!checkout) return;
    const previous = checkout.payments ?? [];
    const changed = payments.length > previous.length ? payments.at(-1) : previous.find(payment => !payments.includes(payment));
    const saved = record({ ...checkout, payments }, changed ? (payments.length > previous.length ? 'Payment recorded' : 'Payment removed') + ' · ' + changed.method + ' · ₹' + changed.amount / 100 : undefined);
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  function changeTip(tip: number) {
    if (!checkout) return;
    const saved = record({ ...checkout, tip }, tip ? 'Tip set · ₹' + tip / 100 : 'Tip removed');
    setCheckout(saved);
    setDetail({ kind: 'order', order: saved });
  }
  function completeBill(payments: Payment[]) {
    if (!checkout || issueLock.current) return 'The bill has already been processed.';
    const error = visitError(checkout, true);
    if (error) return error;
    if (sumPayments(payments) + (checkout.advance?.amount ?? 0) !== payable(checkout, database.business.taxRate)) return 'Record the full balance before issuing the bill.';
    issueLock.current = true;
    const id = 'SR-' + (Math.max(0, ...database.bills.map(bill => Number(bill.id.slice(3)))) + 1);
    const now = new Date().toISOString();
    const customer = database.guests.find(guest => guest.id === checkout.guestId);
    const order: Visit = { ...checkout, guestPhone: checkout.guestPhone || customer?.phone, payments, status: 'Billed', takenAt: checkout.takenAt ?? now, updatedAt: now, events: [...(checkout.events ?? []), event('Bill issued', id)] };
    const bill: Bill = { id, order, date: serviceDay(), time: localTime(), payments, taxRate: database.business.taxRate, business: { ...database.business }, tableName: order.table ? tableName(database, order.table) : undefined };
    update(state => ({ ...state, orders: putOrder(state, order), bills: [bill, ...state.bills] }));
    setCheckout(undefined); viewBill(bill); setMessage('Bill ' + id + ' issued.');
  }
  function closeVisit(requested: Visit) {
    const visit = database.orders.find(item => item.id === requested.id);
    if (!visit || visit.guestLeftAt || visit.status !== 'Billed') return;
    const now = new Date().toISOString();
    record({ ...visit, guestLeftAt: now }, visit.kind === 'Parcel' ? 'Parcel collected' : 'Guest left');
    setMessage(visit.kind === 'Parcel' ? 'Parcel collected.' : 'Guest departure recorded.');
  }
  function logBillAction(bill: Bill, action: string) {
    const visit = database.orders.find(item => item.id === bill.order.id);
    if (visit) record(visit, action);
  }
  function saveGuest(guest: Guest) {
    update(state => ({ ...state, guests: state.guests.some(item => item.id === guest.id) ? state.guests.map(item => item.id === guest.id ? guest : item) : [guest, ...state.guests] }));
    if (guestEditor?.inOrder && detail?.kind === 'order') setDetail({ kind: 'order', order: { ...detail.order, guestId: guest.id, guest: guest.name, guestPhone: guest.phone, guestDetails: 'Collected' } });
    else selectGuest(guest);
    setGuestEditor(undefined);
    setMessage(guest.sync === 'Sync pending' ? 'Customer saved. Contact sync pending.' : 'Customer saved.');
  }
  const order = detail?.kind === 'order' ? detail.order : undefined;
  const bill = detail?.kind === 'bill' ? data.bills.find(item => item.id === detail.id) : undefined;
  const guest = detail?.kind === 'guest' ? data.guests.find(item => item.id === detail.id) : undefined;
  const actors = database.staff.filter(staff => staff.role === role && staff.active);
  const currentActor = actors.find(staff => staff.id === actorId) ?? actors[0];
  const userName = currentActor?.name ?? sessionProfile[role] ?? roleNames[role];
  const initials = userName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const searchTerm = query.trim().toLowerCase();
  const searchPages = allowed.filter(item => (item === 'Menu' ? 'menu food pricing' : item.toLowerCase()).includes(searchTerm));
  const searchOrders = searchTerm ? data.orders.filter(item => activeOrder(item) && (item.id + ' ' + guestLabel(item)).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  const searchBills = searchTerm ? data.bills.filter(item => (item.id + ' ' + guestLabel(item.order)).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  const searchGuests = searchTerm ? data.guests.filter(item => (item.name + ' ' + item.phone).toLowerCase().includes(searchTerm)).slice(0, 4) : [];
  const phoneMatch = (candidate: Guest) => database.guests.some(item => item.id !== candidate.id && item.phone === candidate.phone);

  let body;
  if (order && (page === 'Orders' || page === 'Billing desk')) body = <>
    <OrderEditor key={order.id || 'new'} order={order} update={value => { editorChanged.current = true; setDetail({ kind: 'order', order: value }); }} data={data} atBillingDesk={page === 'Billing desk'} staff={data.staff.filter(member => member.active)} onProgress={progress} cancel={() => protectNavigation(() => go(page === 'Billing desk' ? 'Billing desk' : 'Orders'))} save={saveOrder} checkout={startCheckout} addGuest={() => setGuestEditor({ inOrder: true })} />
    {order.id && <button className="btn secondary order-admin" onClick={() => setConfirmation('cancel')}>Cancel saved order</button>}
  </>;
  else if (bill && page === 'Bills') {
    const visit = database.orders.find(item => item.id === bill.order.id);
    const awaitingDeparture = visit?.status === 'Billed' && visit.takenAt && !visit.guestLeftAt;
    body = <BillPreview key={bill.id} bill={bill} table={bill.tableName ?? (bill.order.table ? tableName(database, bill.order.table) : '')} close={() => go('Billing desk')} canVoid={role === 'Owner'} onVoid={() => setConfirmation('void')} onShare={event => logBillAction(bill, event.channel + ' share ' + event.action)} onDeparture={awaitingDeparture ? () => setDeparture(visit) : undefined} />;
  }
  else switch (page) {
    case 'Overview': body = <Dashboard data={data} role={role} open={openOrder} newOrder={() => startOrder()} viewBill={viewBill} go={go} />; break;
    case 'Dining tables': body = <Dining data={data} role={role} allOrders={database.orders} update={update} open={openOrder} start={startOrder} startParcel={() => startOrder('', 'Parcel')} notify={setMessage} depart={setDeparture} />; break;
    case 'Orders': body = <Orders data={data} open={openOrder} start={() => startOrder()} bill={viewBill} />; break;
    case 'Billing desk': body = <BillingDesk data={data} open={visit => openOrder(visit, true)} view={viewBill} closeVisit={closeVisit} startParcel={() => startOrder('', 'Parcel')} />; break;
    case 'Activity': body = <Activity data={data} />; break;
    case 'Bills': body = <><Title title="Bills" subtitle={'Find, reprint and share issued restaurant bills.'} /><BillList bills={data.bills} view={viewBill} /></>; break;
    case 'Payments': body = <Payments data={data} view={viewBill} />; break;
    case 'Customers': body = <Customers data={data} role={role} selected={guest} select={selectGuest} edit={value => setGuestEditor({ guest: value })} add={() => setGuestEditor({})} viewBill={viewBill} retry={value => {
      if (!database.business.contactSync) { setMessage('Contact sync is disabled in Settings.'); return; }
      if (phoneMatch(value)) { setMessage('This number is shared. Review the customer details before syncing.'); return; }
      update(state => ({ ...state, guests: state.guests.map(item => item.id === value.id ? { ...item, sync: 'Synced' } : item) }));
      setMessage('Contact synced in the demo.');
    }} />; break;
    case 'Menu': body = <Menu data={data} update={update} notify={setMessage} />; break;
    case 'Reports': body = <Reports data={data} />; break;
    case 'Staff & access': body = <StaffAccess data={data} update={update} notify={setMessage} />; break;
    case 'Settings': body = <Settings business={data.business} update={update} notify={setMessage} />; break;
    case 'My profile': body = <><Title title="My profile" subtitle="Manage your display name and see your current role." /><form className="panel settings-panel" key={role} onSubmit={event => {
      event.preventDefault();
      const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
      if (!name) { setMessage('Enter a display name.'); return; }
      setSessionProfile(state => ({ ...state, [role]: name })); setMessage('Profile saved.');
    }}><Field label="Display name"><input name="name" required defaultValue={sessionProfile[role] ?? userName} /></Field><Field label="Current role"><input value={role} readOnly /></Field><button className="btn primary">Save profile</button></form></>; break;
  }

  return <div className="workspace">
    {drawer && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)} />}
    <aside className={'sidebar ' + (drawer ? 'drawer-open' : '')}>
      <button className="brand-button" onClick={() => protectNavigation(() => go('Overview'))} aria-label="Sweet Rascal overview"><Brand /></button>
      <nav aria-label="Main navigation">{navigation.map(group => <div className="nav-group" key={group.label}>
        <p>{group.label}</p>{group.pages.filter(item => allowed.includes(item)).map(item => { const Icon = icons[item]; return <button key={item} className={page === item ? 'nav-active' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => protectNavigation(() => go(item))}><Icon size={18} />{item === 'Menu' ? 'Food & pricing' : item}</button>; })}
      </div>)}</nav>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => { setDrawer(false); setHelp(true); }}><CircleHelp size={17} /> Help</button>
        <button className="sidebar-profile" onClick={() => protectNavigation(() => go('My profile'))}><span className="avatar">{initials}</span><span><strong>{userName}</strong><small>{role}</small></span><ChevronRight size={16} /></button></div>
    </aside>
    <div className="workspace-body">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setDrawer(!drawer)} aria-label="Open navigation" aria-expanded={drawer}><MenuIcon size={21} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{page === 'Menu' ? 'Food & pricing' : page}</strong></div>
        <div className="top-actions">{actors.length > 1 && <select className="actor-select" aria-label="Staff member" value={currentActor?.id} onChange={e => setActorId(e.target.value)}>{actors.map(staff => <option value={staff.id} key={staff.id}>{staff.name}</option>)}</select>}<button className="icon-button top-search" onClick={() => { setSearch(true); setQuery(''); }} aria-label="Search workspace"><Search size={19} /></button><label className="role-switch"><ShieldCheck size={16} /><span>Preview as</span><select value={role} aria-label="Preview as role" onChange={event => { const next = event.target.value as Role; protectNavigation(() => switchRole(next)); }}>{roles.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label></div>
      </header>
      <main className="main-content" id="main">{allowed.includes(page) ? body : <Empty title="This page is restricted" />}</main>
      <nav className="mobile-nav" aria-label="Quick navigation">
        {(['Overview', 'Dining tables', 'Orders', 'Billing desk'] as const).map(item => { const Icon = icons[item]; return <button key={item} aria-current={page === item ? 'page' : undefined} onClick={() => protectNavigation(() => go(item))}><Icon size={20} />{item === 'Dining tables' ? 'Tables' : item === 'Billing desk' ? 'Billing' : item}</button>; })}
        <button onClick={() => setDrawer(!drawer)} aria-expanded={drawer}><MenuIcon size={20} /> More</button>
      </nav>
    </div>
    {message && <div className="toast" role="status"><CheckCircle2 size={20} /><span>{message}</span><button aria-label="Dismiss notification" className="icon-button" onClick={() => setMessage('')}><X size={16} /></button></div>}
    {guestEditor && <GuestEditor guest={guestEditor.guest} guests={database.guests} role={role} sync={database.business.contactSync} save={saveGuest} close={() => setGuestEditor(undefined)} />}
    {checkout && <Checkout order={checkout} taxRate={database.business.taxRate} close={() => setCheckout(undefined)} complete={completeBill} onPaymentsChange={changePayments} onTipChange={changeTip} />}
    {departure && <Dialog title={departure.kind === 'Parcel' ? 'Mark parcel collected?' : 'Confirm guests have left'} close={() => setDeparture(undefined)}>
      <p>{departure.kind === 'Parcel' ? 'Confirm when the customer has collected their order.' : 'This makes the table available for the next guests.'}</p>
      <div className="dialog-actions"><button className="btn secondary" onClick={() => setDeparture(undefined)}>Cancel</button><button className="btn primary" onClick={() => { closeVisit(departure); setDeparture(undefined); }}>{departure.kind === 'Parcel' ? 'Mark collected' : 'Free table'}</button></div>
    </Dialog>}
    {confirmation && <Dialog title={confirmation === 'void' ? 'Void this sample bill?' : confirmation === 'cancel' ? 'Cancel this order?' : 'Leave this order?'} close={() => setConfirmation(undefined)}>
      <Form close={() => setConfirmation(undefined)} label={confirmation === 'void' ? 'Void bill' : confirmation === 'cancel' ? 'Cancel order' : 'Leave order'} danger onSave={form => {
        const reason = String(form.get('reason') ?? '').trim();
        if (confirmation !== 'leave' && !reason) return 'Enter a reason.';
        if (confirmation === 'void' && bill && role === 'Owner') {
          update(state => ({ ...state, bills: state.bills.map(item => item.id === bill.id ? { ...item, voided: true } : item) })); logBillAction(bill, 'Bill voided · ' + reason); setMessage(bill.id + ' was voided.');
        }
        if (confirmation === 'cancel' && order?.id) {
          const stored = database.orders.find(item => item.id === order.id);
          if (stored?.advance || stored?.payments?.length) return 'This order has an advance. Resolve that payment before cancelling.';
          record({ ...(stored ?? order), status: 'Cancelled' }, 'Order cancelled · ' + reason);
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
    {help && <Dialog title="Using the demo" close={() => setHelp(false)}><div className="help-body"><p>Switch roles with <b>Preview as</b>. Each role has its own access to pages and records.</p><p>Start a walk-in or phone pre-order from <b>New order</b>. Use <b>Checkout</b> to record payments and preview an A4 bill.</p><p>Changes are saved in this browser.</p><button className="btn primary" onClick={() => { setHelp(false); startOrder(); }}><Plus size={16} /> New order</button></div></Dialog>}
  </div>;
}

