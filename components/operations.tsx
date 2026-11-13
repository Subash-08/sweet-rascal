'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, CircleUserRound, Grid2X2, Package, Plus, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { type Bill, type Business, type Database, type Dish, type Guest, type Role, type Staff, type Table, type Visit, defaultStaffDiscountLimit, isSampleGuest, methods, occupiesTable, parseMoney, payable, rolePages, roles, rupees, shortDate, sumPayments, timeZone } from '../lib/demo';
import { Badge, DataTable, Dialog, Empty, Field, Form, Title, fieldValue } from './ui';
import { BillList, Status, guestLabel, tableName } from './overview';
import { TicketCard } from './ticket-card';

export type Update = Dispatch<SetStateAction<Database>>;
const recordId = (prefix: string) => prefix + '-' + crypto.randomUUID();

const reservesTable = (order: Visit) => order.kind !== 'Parcel' && !order.guestLeftAt && order.status === 'Upcoming';

export function Dining({ data, allOrders, role, update, open, start, startParcel, notify, depart }: { data: Database; allOrders: Visit[]; role: Role; update: Update; open: (order: Visit) => void; start: (table: string) => void; startParcel?: () => void; notify: (message: string) => void; depart: (order: Visit) => void }) {
  const [area, setArea] = useState('All areas');
  const [filter, setFilter] = useState('All statuses');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [editing, setEditing] = useState<Table | 'new'>();
  const diningAreas = [...new Set(data.tables.map(table => table.area))];
  const areas = ['All areas', ...diningAreas];
  const tableStates = data.tables.map(table => {
    const occupied = allOrders.find(order => order.table === table.id && occupiesTable(order));
    const booked = allOrders.find(order => order.table === table.id && reservesTable(order));
    return { table, order: occupied ?? booked, status: occupied ? 'Occupied' : booked ? 'Reserved' : 'Available' };
  });
  const availableTables = tableStates.filter(entry => entry.status === 'Available');
  const selectedTable = availableTables.find(entry => entry.table.id === selectedTableId)?.table;
  const visible = tableStates.filter(({ table, status }) => (area === 'All areas' || table.area === area) && (filter === 'All statuses' || status === filter));
  const edit = editing === 'new' ? undefined : editing;
  return <><Title title="Dining tables" subtitle="Select an available table to take a dine-in order." action={<>
    <select className="max-w-full" style={{ width: 'auto' }} aria-label="Table for new dine-in order" value={selectedTable?.id ?? ''} disabled={!availableTables.length} onChange={event => setSelectedTableId(event.target.value)}>
      <option value="">{availableTables.length ? 'Select a table' : 'No tables available'}</option>
      {availableTables.map(({ table }) => <option key={table.id} value={table.id}>{table.name} · {table.area}</option>)}
    </select>
    <button className="btn primary" disabled={!selectedTable} onClick={() => { if (selectedTable) start(selectedTable.id); }}><Plus size={17} /> Take dine-in order</button>
    {startParcel && <button className="btn secondary" onClick={startParcel}><Package size={17} /> Parcel</button>}
    <button className="btn secondary" onClick={() => setEditing('new')}><Plus size={17} /> Add table</button>
  </>} />
    <div className="dining-tools"><div className="chips">{areas.map(name => <button key={name} aria-pressed={area === name} className={area === name ? 'active' : ''} onClick={() => setArea(name)}>{name}</button>)}</div><select aria-label="Table status" value={filter} onChange={e => setFilter(e.target.value)}>{['All statuses', 'Available', 'Occupied', 'Reserved'].map(status => <option key={status}>{status}</option>)}</select></div>
    <div className="table-cards">{visible.map(({ table, order, status }) => {
      const visibleOrder = order && data.orders.some(item => item.id === order.id) ? order : undefined;
      return <section key={table.id} className="panel table-card" data-status={status}><div className="section-head"><span className="row-icon"><Grid2X2 size={20} /></span><Status status={status} /></div><h2>{table.name}</h2><p>{table.area} · {table.seats} seats</p>
        <div className="section-head">
          {order?.status === 'Billed' ? <div className="table-departure"><small>Bill issued · table occupied</small><button className="text-button" onClick={() => depart(order)}>Confirm departure <ArrowRight size={15} /></button><button className="text-button" onClick={() => open(order)}>View bill</button></div> : <button disabled={Boolean(order && !visibleOrder)} className="text-button" onClick={() => visibleOrder ? open(visibleOrder) : start(table.id)}>
            {visibleOrder?.status === 'Draft' ? 'Resume draft' : visibleOrder ? 'View order' : order ? 'Assigned to staff' : 'Start at table'} <ArrowRight size={15} />
          </button>}
          {role === 'Owner' && <button className="btn secondary compact" onClick={() => setEditing(table)}>Edit</button>}
        </div>
      </section>;
    })}</div>
    {!visible.length && <div className="panel"><Empty title={data.tables.length ? 'No tables match' : 'No dining tables yet'} detail={data.tables.length ? 'Try a different area or status.' : 'Add a table to start taking dine-in orders.'} /></div>}
    {editing && <Dialog title={edit ? 'Edit dining table' : 'Add dining table'} close={() => setEditing(undefined)}><Form close={() => setEditing(undefined)} onSave={form => {
      const name = fieldValue(form, 'name'), areaName = fieldValue(form, 'area'), seats = Number(fieldValue(form, 'seats'));
      if (!name || !areaName || !Number.isInteger(seats) || seats < 1 || seats > 99) return 'Enter a table name, dining area and seat count from 1 to 99.';
      if (areaName.toLowerCase() === 'all areas') return 'Choose a different dining area name.';
      if (data.tables.some(table => table.id !== edit?.id && table.name.trim().toLowerCase() === name.toLowerCase())) return 'That table name is already in use.';
      if (edit && allOrders.some(order => order.table === edit.id && (occupiesTable(order) || reservesTable(order)) && order.covers + (order.extraCovers ?? 0) > seats)) return 'This table has an order with more guests than the new seat count.';
      const tableArea = diningAreas.find(name => name.toLowerCase() === areaName.toLowerCase()) ?? areaName;
      const table = { id: edit?.id ?? recordId('table'), name, area: tableArea, seats };
      update(state => ({ ...state, tables: edit ? state.tables.map(item => item.id === edit.id ? table : item) : [...state.tables, table] }));
      if (!edit) {
        setSelectedTableId(table.id);
        setFilter('All statuses');
        if (area !== 'All areas') setArea(tableArea);
      }
      setEditing(undefined);
      notify('Table saved.');
    }}>
      <Field label="Table name"><input name="name" required defaultValue={edit?.name} /></Field>
      <Field label="Dining area"><input name="area" list="dining-area-options" required defaultValue={edit?.area} /></Field>
      <datalist id="dining-area-options">{diningAreas.map(name => <option key={name} value={name} />)}</datalist>
      <Field label="Seat capacity"><input name="seats" type="number" min={1} max={99} required defaultValue={edit?.seats ?? 4} /></Field>
    </Form></Dialog>}
  </>;
}

const orderTime = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });

function eventTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : orderTime.format(timestamp);
}

export function Orders({ data, open, start, bill }: { data: Database; open: (order: Visit) => void; start: () => void; bill: (bill: Bill) => void }) {
  const [status, setStatus] = useState('All orders');
  const billingQueue = (order: Visit) => order.readyForBilling && order.status !== 'Billed' && order.status !== 'Cancelled';
  const billsByOrder = new Map(data.bills.map(item => [item.order.id, item]));
  const rows = data.orders.filter(order => status === 'All orders' || order.status === status || (status === 'Waiting for bill' && billingQueue(order)));
  return <><Title title="Orders" subtitle="Resume drafts and track dine-in, parcel and billing progress." action={<button className="btn primary" onClick={start}><Plus size={17} /> New order</button>} />
    <DataTable rows={rows} search={order => [order.id, guestLabel(order), order.kind ?? 'Dine-in', order.source, tableName(data, order.table), billsByOrder.get(order.id)?.id].join(' ')} placeholder="Search orders…"
      mobileCard={order => {
        const linked = billsByOrder.get(order.id);
        const due = Math.max(0, payable(order, data.business.taxRate) - (order.advance?.amount ?? 0) - sumPayments(order.payments ?? []));
        const time = order.kind === 'Parcel' ? order.pickupTime || order.time : order.time;
        const count = order.items.reduce((total, item) => total + item.quantity, 0);
        return <TicketCard reference={linked ? order.id + ' · ' + linked.id : order.id} guest={guestLabel(order)}
          context={[order.kind === 'Parcel' ? 'Parcel' : tableName(data, order.table), order.date && shortDate(order.date), time, count + (count === 1 ? ' item' : ' items')].filter(Boolean).join(' · ')}
          status={<Status status={linked?.voided ? 'Voided' : order.guestLeftAt && linked ? 'Completed' : order.guestLeftAt ? 'Departed' : billingQueue(order) ? 'Waiting for bill' : order.servedAt ? order.kind === 'Parcel' ? 'Packed' : 'Food served' : order.status === 'Open' ? 'Order taken' : order.status} />}
          amount={linked ? <b>{rupees(payable(linked.order, linked.taxRate))}</b> : order.status !== 'Cancelled' && due > 0 ? <b>{rupees(due)} due</b> : undefined}
          action={linked ? 'View bill' : order.status === 'Draft' ? 'Resume' : 'View order'}
          onOpen={linked ? () => bill(linked) : order.status !== 'Cancelled' && order.status !== 'Billed' ? () => open(order) : undefined} />;
      }}
      filters={<select aria-label="Order status" value={status} onChange={e => setStatus(e.target.value)}>{['All orders', 'Draft', 'Open', 'Upcoming', 'Waiting for bill', 'Billed', 'Cancelled'].map(name => <option key={name}>{name}</option>)}</select>}
      columns={[
        { label: 'Order', render: order => {
          const linked = billsByOrder.get(order.id);
          return order.status === 'Cancelled' ? <strong>{order.id}</strong> : <button className="text-button" onClick={() => linked ? bill(linked) : open(order)}>{order.id}</button>;
        }, sort: order => order.id },
        { label: 'Guest', render: order => <strong>{guestLabel(order)}</strong>, sort: guestLabel },
        { label: 'Service', render: order => <div>
          <strong>{order.kind ?? 'Dine-in'}</strong><br />
          {order.table ? tableName(data, order.table) : order.kind === 'Parcel' ? 'Pickup' : 'Unassigned'} · {order.source}
        </div> },
        { label: 'Visit', render: order => {
          const time = order.kind === 'Parcel' ? order.pickupTime || order.time : order.time;
          return [order.date && shortDate(order.date), time].filter(Boolean).join(' · ') || '—';
        }, sort: order => order.date + (order.pickupTime || order.time) },
        { label: 'Progress', render: order => <div>
          <Status status={order.status} />
          {order.servedAt && <div>{order.kind === 'Parcel' ? 'Packed' : 'Food served'} · {eventTime(order.servedAt)}</div>}
          {order.guestLeftAt && <div>{order.kind === 'Parcel' ? 'Collected' : 'Guest left'} · {eventTime(order.guestLeftAt)}</div>}
        </div> },
        { label: 'Billing', render: order => {
          const linked = billsByOrder.get(order.id);
          if (linked) return <button className="text-button" onClick={() => bill(linked)}>{linked.id}{linked.voided ? ' · Voided' : ''}</button>;
          if (order.status === 'Billed') return <Status status="Billed" />;
          if (order.status === 'Cancelled') return '—';
          const total = payable(order, data.business.taxRate);
          const paid = (order.advance?.amount ?? 0) + sumPayments(order.payments ?? []);
          const due = Math.max(0, total - paid);
          return <div>
            {billingQueue(order) && <Badge tone="blue">Waiting for bill</Badge>}
            <div>{due > 0 ? rupees(due) + ' due' : paid > 0 ? 'Payment recorded' : '—'}</div>
          </div>;
        } },
        { label: 'Items', numeric: true, render: order => order.items.reduce((sum, line) => sum + line.quantity, 0) },
      ]} />
  </>;
}

export function GuestEditor({ guest, guests, role, sync, save, close }: { guest?: Guest; guests: Guest[]; role: Role; sync: boolean; save: (guest: Guest) => void; close: () => void }) {
  const [companions, setCompanions] = useState(guest?.companions ?? []);
  function normalize(phone: string) { return phone.replace(/[^0-9]/g, '').replace(/^(?:0091|91|0)(?=\d{10}$)/, ''); }
  function validPhone(phone: string) {
    return /^\+?[\d ().-]+$/.test(phone) && (!phone.startsWith('+') || /^91\d{10}$/.test(phone.replace(/\D/g, ''))) && /^\d{10}$/.test(normalize(phone));
  }
  return <Dialog title={guest ? 'Edit customer' : 'New customer'} description="Save contact details for future visits." close={close}><Form close={close} label="Save customer" onSave={form => {
    const name = fieldValue(form, 'name'), rawPhone = fieldValue(form, 'phone');
    if (!name) return 'Enter the customer’s name.';
    if (rawPhone && !validPhone(rawPhone)) return 'Enter a valid 10-digit mobile number.';
    const phone = rawPhone ? normalize(rawPhone) : '';
    const shared = Boolean(phone && guests.some(item => item.id !== guest?.id && normalize(item.phone) === phone));
    if (shared && !form.has('shared')) return 'That phone is already saved. Confirm that it is shared.';
    if (companions.some(item => !item.name.trim() || !validPhone(item.phone))) return 'Enter a name and valid mobile number for each additional contact.';
    const saved: Guest = {
      id: guest?.id ?? recordId('guest'), name, phone,
      contactNote: fieldValue(form, 'contactNote'),
      notes: role === 'Owner' ? fieldValue(form, 'notes') : guest?.notes ?? '',
      companions: companions.map(item => ({ id: item.id ?? recordId('companion'), name: item.name.trim(), phone: normalize(item.phone), saveToGoogle: item.saveToGoogle })),
      assigned: guest?.assigned ?? role,
      sync: phone ? 'Sync pending' : 'No phone',
    };
    save(saved);
  }}>
    <Field label="Name"><input name="name" autoComplete="off" maxLength={120} required defaultValue={guest?.name} /></Field>
    <Field label="Mobile number"><input name="phone" type="tel" placeholder="10-digit number" defaultValue={guest?.phone} /></Field>
    <label className="check-field wide"><input type="checkbox" name="shared" /> This number is shared with another customer</label>
    <Field label="Phone contact note" wide><textarea name="contactNote" rows={2} maxLength={500} defaultValue={guest?.contactNote} /></Field>
    <p className="hint wide"><Smartphone size={15} /> {guest && isSampleGuest(guest.id) ? 'Add a new customer to test Google Contacts.' : sync ? 'Google sync uses the name, mobile number and phone contact note. Private notes stay in Sweet Rascal.' : 'Automatic contact sync is off in Settings.'}</p>
    <div className="wide"><div className="section-head"><h3>Additional contacts</h3><button type="button" className="btn secondary compact" onClick={() => setCompanions([...companions, { name: '', phone: '' }])}><Plus size={14} /> Add</button></div>
      {companions.map((item, index) => <div className="companion" key={index}><input aria-label={'Contact ' + (index + 1) + ' name'} placeholder="Name" value={item.name} onChange={e => setCompanions(companions.map((old, i) => i === index ? { ...old, name: e.target.value } : old))} /><input aria-label={'Contact ' + (index + 1) + ' phone'} type="tel" placeholder="Mobile" value={item.phone} onChange={e => setCompanions(companions.map((old, i) => i === index ? { ...old, phone: e.target.value } : old))} /><button type="button" className="text-button" aria-label={'Remove contact ' + (index + 1)} onClick={() => setCompanions(companions.filter((_, i) => i !== index))}>Remove</button></div>)}
      {companions.map((item, index) => <label key={index} className="check-field"><input type="checkbox" checked={Boolean(item.saveToGoogle)} onChange={e => setCompanions(companions.map((old, i) => i === index ? { ...old, saveToGoogle: e.target.checked } : old))} /> Save {item.name.trim() || 'additional contact ' + (index + 1)} as a separate Google contact</label>)}
    </div>
    {role === 'Owner' && <Field label="Private owner notes" wide><textarea name="notes" rows={3} defaultValue={guest?.notes} /></Field>}
  </Form></Dialog>;
}

export function Customers({ data, role, selected, select, edit, add, viewBill, retry }: { data: Database; role: Role; selected?: Guest; select: (guest?: Guest) => void; edit: (guest: Guest) => void; add: () => void; viewBill: (bill: Bill) => void; retry: (guest: Guest) => void }) {
  const contactStatus = (guest: Guest) => isSampleGuest(guest.id) ? 'Sample' : guest.sync;
  if (selected) {
    const visits = data.bills.filter(bill => bill.order.guestId === selected.id);
    return <><Title title={selected.name} subtitle={selected.phone ? '+91 ' + selected.phone : 'No mobile number'} action={<><button className="btn secondary" onClick={() => select()}><ArrowLeft size={16} /> Customers</button><button className="btn primary" onClick={() => edit(selected)}>Edit customer</button></>} />
      <div className="dashboard-grid"><section className="panel profile-card"><CircleUserRound size={24} /><h2>Contact details</h2><p>{selected.phone ? '+91 ' + selected.phone : 'No mobile number'}</p><Status status={contactStatus(selected)} />{selected.syncIssue && <p className="hint">{selected.syncIssue}</p>}{contactStatus(selected) === 'Sync pending' && <button className="text-button" onClick={() => retry(selected)}>Retry contact sync</button>}
        <h3>Phone contact note</h3><p>{selected.contactNote || 'No contact note added.'}</p></section>
        <section className="panel profile-card"><Users size={24} /><h2>Additional contacts</h2>
          {selected.companions.length ? selected.companions.map((item, index) => <p key={index}><b>{item.name}</b> · +91 {item.phone}</p>) : <p>No additional contacts.</p>}
        </section>
        {role === 'Owner' && <section className="panel profile-card"><h2>Private owner notes</h2><p>{selected.notes || 'No notes added.'}</p></section>}</div>
      <div className="section-head section-spacing"><h2>Previous bills</h2></div><BillList bills={visits} view={viewBill} />
    </>;
  }
  return <><Title title="Customers" subtitle="Find guests, contact details and previous visits." action={<button className="btn primary" onClick={add}><Plus size={17} /> Add customer</button>} />
    <DataTable rows={data.guests} search={guest => [guest.name, guest.phone, ...guest.companions.flatMap(item => [item.name, item.phone])].join(' ')} placeholder="Search name or mobile…"
      mobileCard={guest => <TicketCard reference={guest.phone ? '+91 ' + guest.phone : 'No mobile number'} guest={guest.name}
        context={data.bills.filter(bill => bill.order.guestId === guest.id).length + ' recorded bills'} status={<Status status={contactStatus(guest)} />}
        action="View customer" actionLabel={'View customer ' + guest.name} onOpen={() => select(guest)} />}
      columns={[
        { label: 'Customer', render: guest => <button className="text-button" onClick={() => select(guest)}>{guest.name}<ChevronRight size={15} /></button>, sort: guest => guest.name },
        { label: 'Mobile', render: guest => guest.phone ? '+91 ' + guest.phone : '—' },
        { label: 'Contact sync', render: guest => <Status status={contactStatus(guest)} /> },
        { label: 'Bills', numeric: true, render: guest => data.bills.filter(bill => bill.order.guestId === guest.id).length },
      ]} />
  </>;
}

export function Menu({ data, update, notify }: { data: Database; update: Update; notify: (message: string) => void }) {
  const [tab, setTab] = useState<'Items' | 'Categories'>('Items');
  const [category, setCategory] = useState('All categories');
  const [availability, setAvailability] = useState('All availability');
  const [editing, setEditing] = useState<Dish | 'new'>();
  const [categoryEdit, setCategoryEdit] = useState<{ name: string }>();
  const edit = editing === 'new' ? undefined : editing;
  function setDishAvailability(dish: Dish) {
    update(state => ({ ...state, dishes: state.dishes.map(item => item.id === dish.id ? { ...item, available: !item.available } : item) }));
    notify(dish.name + (dish.available ? ' marked sold out.' : ' is available.'));
  }
  return <><Title title="Food & pricing" subtitle="Manage your menu, prices, categories and sold-out dishes." action={<button className="btn primary" onClick={() => tab === 'Items' ? setEditing('new') : setCategoryEdit({ name: '' })}><Plus size={17} /> {tab === 'Items' ? 'Add dish' : 'Add category'}</button>} />
    <div className="chips view-tabs">{(['Items', 'Categories'] as const).map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Items' ? <DataTable rows={data.dishes.filter(dish => (category === 'All categories' || dish.category === category) && (availability === 'All availability' || (availability === 'Available') === dish.available))}
      search={dish => dish.name + ' ' + dish.description} placeholder="Search dishes…" filters={<><select aria-label="Dish category" value={category} onChange={e => setCategory(e.target.value)}>{['All categories', ...data.categories].map(name => <option key={name}>{name}</option>)}</select><select aria-label="Dish availability" value={availability} onChange={e => setAvailability(e.target.value)}><option>All availability</option><option>Available</option><option>Sold out</option></select></>}
      mobileCard={dish => <TicketCard reference={dish.category} guest={dish.name} context={dish.kind}
        status={<Status status={dish.available ? 'Available' : 'Sold out'} />}
        amount={<><b>{rupees(dish.price, true)}</b><button className="text-button" aria-label={(dish.available ? 'Mark sold out: ' : 'Mark available: ') + dish.name} onClick={() => setDishAvailability(dish)}>{dish.available ? 'Mark sold out' : 'Make available'}</button></>}
        action="Edit" actionLabel={'Edit ' + dish.name} onOpen={() => setEditing(dish)} />}
      columns={[
        { label: 'Dish', render: dish => <button className="text-button" onClick={() => setEditing(dish)}>{dish.name}</button>, sort: dish => dish.name },
        { label: 'Category', render: dish => dish.category, sort: dish => dish.category },
        { label: 'Type', render: dish => dish.kind },
        { label: 'Availability', render: dish => <Status status={dish.available ? 'Available' : 'Sold out'} /> },
        { label: 'Price', numeric: true, render: dish => rupees(dish.price, true), sort: dish => dish.price },
        { label: 'Actions', render: dish => <div className="catalog-actions">
          <button className="btn secondary compact" aria-label={'Edit ' + dish.name} onClick={() => setEditing(dish)}>Edit</button>
          <button className="text-button" aria-label={(dish.available ? 'Mark sold out: ' : 'Mark available: ') + dish.name} onClick={() => setDishAvailability(dish)}>{dish.available ? 'Mark sold out' : 'Make available'}</button>
        </div> },
      ]} /> : <DataTable rows={data.categories.map(name => ({ id: name, name }))} search={row => row.name} placeholder="Search categories…" columns={[
        { label: 'Category', render: row => <button className="text-button" onClick={() => setCategoryEdit(row)}>{row.name}</button>, sort: row => row.name },
        { label: 'Dishes', numeric: true, render: row => data.dishes.filter(dish => dish.category === row.name).length },
      ]} />}
    {editing && <Dialog title={edit ? 'Edit dish' : 'Add dish'} close={() => setEditing(undefined)}><Form close={() => setEditing(undefined)} onSave={form => {
      const price = parseMoney(fieldValue(form, 'price')), name = fieldValue(form, 'name');
      if (!name || !(price > 0)) return 'Enter a dish name and a valid price.';
      if (data.dishes.some(dish => dish.id !== edit?.id && dish.name.toLowerCase() === name.toLowerCase())) return 'A dish with that name already exists.';
      const dish: Dish = { id: edit?.id ?? recordId('dish'), name, price, category: fieldValue(form, 'category'), description: fieldValue(form, 'description'), available: form.has('available'), kind: fieldValue(form, 'kind') as Dish['kind'] };
      update(state => ({ ...state, dishes: edit ? state.dishes.map(item => item.id === dish.id ? dish : item) : [...state.dishes, dish] })); setEditing(undefined); notify('Dish saved.');
    }}><Field label="Dish name" wide><input name="name" required defaultValue={edit?.name} /></Field><Field label="Category"><select name="category" defaultValue={edit?.category}>{data.categories.map(name => <option key={name}>{name}</option>)}</select></Field><Field label="Type"><select name="kind" defaultValue={edit?.kind}><option>Non-veg</option><option>Egg</option><option>Veg</option></select></Field><Field label="Price (₹)"><input name="price" inputMode="decimal" required defaultValue={edit ? edit.price / 100 : undefined} /></Field><Field label="Description" wide><textarea name="description" rows={2} defaultValue={edit?.description} /></Field><label className="check-field"><input type="checkbox" name="available" defaultChecked={edit?.available ?? true} /> Available to order</label></Form></Dialog>}
    {categoryEdit && <Dialog title={categoryEdit.name ? 'Edit category' : 'Add category'} close={() => setCategoryEdit(undefined)}><Form close={() => setCategoryEdit(undefined)} onSave={form => {
      const name = fieldValue(form, 'name');
      if (!name || data.categories.some(item => item !== categoryEdit.name && item.toLowerCase() === name.toLowerCase())) return 'Enter a unique category name.';
      update(state => ({ ...state, categories: categoryEdit.name ? state.categories.map(item => item === categoryEdit.name ? name : item) : [...state.categories, name], dishes: state.dishes.map(dish => dish.category === categoryEdit.name ? { ...dish, category: name } : dish) }));
      if (category === categoryEdit.name) setCategory(name);
      setCategoryEdit(undefined); notify('Category saved.');
    }}><Field label="Category name" wide><input name="name" required defaultValue={categoryEdit.name} /></Field></Form></Dialog>}
  </>;
}

export function Payments({ data, view }: { data: Database; view: (bill: Bill) => void }) {
  const [method, setMethod] = useState('All methods');
  const linked = new Map(data.bills.map(bill => [bill.order.id, bill]));
  const payments = [
    ...data.bills.filter(bill => !bill.voided).flatMap(bill => bill.payments.map((payment, index) => ({ ...payment, id: bill.id + '-' + index, order: bill.order, bill, kind: 'Checkout' }))),
    ...data.orders.flatMap(order => {
      const bill = linked.get(order.id);
      if (order.status === 'Cancelled' || bill?.voided) return [];
      return [
        ...(order.advance ? [{ ...order.advance, id: order.id + '-advance', order, bill, kind: 'Advance' }] : []),
        ...(!bill ? (order.payments ?? []).map((payment, index) => ({ ...payment, id: order.id + '-pending-' + index, order, bill, kind: 'Checkout' })) : []),
      ];
    }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <><Title title="Payments" subtitle="Review recorded advances and checkout payments." /><DataTable rows={payments.filter(payment => method === 'All methods' || method === payment.method)} search={payment => payment.order.id + ' ' + payment.bill?.id + ' ' + guestLabel(payment.order)}
    placeholder="Search bill, order or guest…" filters={<select aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)}>{['All methods', ...methods].map(name => <option key={name}>{name}</option>)}</select>}
    mobileCard={payment => <TicketCard reference={payment.bill?.id ?? payment.order.id} guest={guestLabel(payment.order)}
      context={shortDate(payment.date) + ' · ' + payment.kind} status={<Badge>{payment.method}</Badge>}
      amount={<b>{rupees(payment.amount, true)}</b>} action="View bill" onOpen={payment.bill ? () => view(payment.bill!) : undefined} />}
    columns={[
      { label: 'Reference', render: payment => payment.bill ? <button className="text-button" onClick={() => view(payment.bill!)}>{payment.bill.id}</button> : payment.order.id },
      { label: 'Guest', render: payment => guestLabel(payment.order) },
      { label: 'Date', render: payment => shortDate(payment.date), sort: payment => payment.date },
      { label: 'Payment', render: payment => payment.kind },
      { label: 'Method', render: payment => <Badge>{payment.method}</Badge> },
      { label: 'Amount', numeric: true, render: payment => <b>{rupees(payment.amount, true)}</b>, sort: payment => payment.amount },
    ]} /></>;
}
export function StaffAccess({ data, update, notify }: { data: Database; update: Update; notify: (message: string) => void }) {
  const [tab, setTab] = useState('Team');
  const [editing, setEditing] = useState<Staff | 'new'>();
  const edit = editing === 'new' ? undefined : editing;
  return <><Title title="Staff & access" subtitle="Manage demo staff and review what each role can access." action={tab === 'Team' && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={17} /> Add staff</button>} />
    <div className="chips view-tabs">{['Team', 'Permissions'].map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === 'Team' ? <DataTable rows={data.staff} search={staff => staff.name + ' ' + staff.role} placeholder="Search staff…"
      mobileCard={staff => <TicketCard reference={staff.role} guest={staff.name} status={<Status status={staff.active ? 'Active' : 'Inactive'} />}
        action="Edit" actionLabel={'Edit ' + staff.name} onOpen={() => setEditing(staff)} />} columns={[
      { label: 'Name', render: staff => <button className="text-button" onClick={() => setEditing(staff)}>{staff.name}</button>, sort: staff => staff.name },
      { label: 'Role', render: staff => staff.role },
      { label: 'Status', render: staff => <Status status={staff.active ? 'Active' : 'Inactive'} /> },
    ]} /> : <div className="permission-grid">{roles.map(role => <section className="panel profile-card" key={role}><ShieldCheck size={22} /><h2>{role}</h2><p>{role === 'Owner' ? 'Full access, including sales reports, activity, private customer notes and business settings.' : 'Add dining tables, take orders, handle billing and update customer contacts.'}</p><ul>{rolePages[role].map(page => <li key={page}>{page}</li>)}</ul></section>)}</div>}
    {editing && <Dialog title={edit ? 'Edit staff member' : 'Add staff member'} close={() => setEditing(undefined)}><Form close={() => setEditing(undefined)} onSave={form => {
      const name = fieldValue(form, 'name'), role = roles.find(value => value === fieldValue(form, 'role')), active = form.has('active');
      if (!name) return 'Enter the staff member’s name.';
      if (!role) return 'Choose Owner or Staff.';
      if (edit?.role === 'Owner' && edit.active && (!active || role !== 'Owner') && !data.staff.some(staff => staff.id !== edit.id && staff.role === 'Owner' && staff.active)) return 'Keep at least one active owner.';
      const staff = { id: edit?.id ?? recordId('staff'), name, role, active };
      update(state => ({ ...state, staff: edit ? state.staff.map(item => item.id === edit.id ? staff : item) : [...state.staff, staff] })); setEditing(undefined); notify('Staff member saved.');
    }}><Field label="Full name"><input name="name" defaultValue={edit?.name} required /></Field><Field label="Role"><select name="role" defaultValue={edit?.role ?? 'Staff'}>{roles.map(role => <option key={role}>{role}</option>)}</select></Field><label className="check-field"><input type="checkbox" name="active" defaultChecked={edit?.active ?? true} /> Active staff member</label></Form></Dialog>}
  </>;
}
export function Settings({ business, update, notify }: { business: Business; update: Update; notify: (message: string) => void }) {
  const [error, setError] = useState('');
  return <><Title title="Settings" subtitle="Manage restaurant details, A4 printing and contact sync." />
    <form className="panel settings-panel" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget), taxRate = Number(fieldValue(form, 'taxRate'));
      const name = fieldValue(form, 'name'), address = fieldValue(form, 'address');
      const staffDiscountLimit = parseMoney(fieldValue(form, 'staffDiscountLimit')) / 100;
      if (!name || !address || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 50) { setError('Enter valid restaurant details and a tax rate from 0 to 50%.'); return; }
      if (!Number.isFinite(staffDiscountLimit) || staffDiscountLimit < 0 || staffDiscountLimit > 100) { setError('Enter a staff discount limit from 0 to 100%.'); return; }
      update(state => ({ ...state, business: { ...state.business, name, address, taxRate, staffDiscountLimit, phone: fieldValue(form, 'phone'), gstin: fieldValue(form, 'gstin'), footer: fieldValue(form, 'footer'), contactSync: form.has('contactSync') } }));
      setError(''); notify('Settings saved.');
    }}><fieldset className="settings-group"><legend>Restaurant and bill</legend><div className="form-grid">
      <Field label="Restaurant name"><input name="name" required defaultValue={business.name} /></Field><Field label="Phone"><input name="phone" type="tel" required defaultValue={business.phone} /></Field>
      <Field label="Address" wide><input name="address" required defaultValue={business.address} /></Field><Field label="GSTIN"><input name="gstin" required defaultValue={business.gstin} /></Field>
      <Field label="CGST and SGST (% each)"><input name="taxRate" type="number" step="0.01" min={0} max={50} required defaultValue={business.taxRate} /></Field>
      <Field label="Bill footer" wide><input name="footer" defaultValue={business.footer} /></Field></div></fieldset>
      <fieldset className="settings-group"><legend>Discount approval</legend><Field label="Staff discount limit (%)"><input name="staffDiscountLimit" type="number" step="0.01" min={0} max={100} required defaultValue={business.staffDiscountLimit ?? defaultStaffDiscountLimit} /></Field><p className="hint">Above this percentage, the owner must approve the discount in Checkout.</p></fieldset>
      <fieldset className="settings-group"><legend>Automatic contact sync</legend><label className="check-field"><input name="contactSync" type="checkbox" defaultChecked={business.contactSync} /> Sync customers to Google when saved on this browser</label>
      <p className="hint">Only the phone contact note syncs. Additional contacts sync individually if selected. Existing Google contacts are never deleted from Sweet Rascal.</p></fieldset>
      {error && <p className="error" role="alert">{error}</p>}<button className="btn primary">Save settings</button>
    </form>
  </>;
}
