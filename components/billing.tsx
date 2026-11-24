'use client';

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Banknote, Check, CreditCard, HandCoins, Minus, Pencil, Percent, Plus, Smartphone, Trash2 } from 'lucide-react';
import { type Database, type Discount, type Line, type Method, type Payment, type Role, type Staff, type Visit, methods, occupiesTable, parseMoney, returningVisitFields, rupees, serviceDay, sessions, shortDate, sumPayments, timeZone, totals } from '../lib/demo';
import { workspaceRequest } from '../lib/workspace-client';
import '../app/order-workspace.css';
import { Badge, Dialog, Empty, Field, SearchInput, Title } from './ui';
import { CustomerSearch } from './customer-search';

export function Totals({ order, taxRate, paid }: { order: Visit; taxRate: number; paid?: number }) {
  taxRate = order.taxRate ?? taxRate;
  const { subtotal, saving, tax, total } = totals(order.items, taxRate, order.discount);
  const advance = order.advance?.amount ?? 0;
  return <dl className="totals">
    <div><dt>Subtotal</dt><dd>{rupees(subtotal, true)}</dd></div>
    {saving > 0 && <div><dt>Discount</dt><dd>−{rupees(saving, true)}</dd></div>}
    <div><dt>CGST ({taxRate}%)</dt><dd>{rupees(tax, true)}</dd></div>
    <div><dt>SGST ({taxRate}%)</dt><dd>{rupees(tax, true)}</dd></div>
    <div className="total-line"><dt>Grand total</dt><dd>{rupees(total, true)}</dd></div>
    {!!order.tip && <><div><dt>Voluntary tip</dt><dd>{rupees(order.tip, true)}</dd></div>
      <div className="total-line"><dt>Total with tip</dt><dd>{rupees(total + order.tip, true)}</dd></div></>}
    {advance > 0 && <div><dt>Advance · {order.advance?.method}</dt><dd>{rupees(advance, true)}</dd></div>}
    {paid !== undefined && <div><dt>Payments at checkout</dt><dd>{rupees(paid, true)}</dd></div>}
    {(advance > 0 || paid !== undefined) && <div className="total-line"><dt>Balance due</dt><dd>{rupees(Math.max(0, total + (order.tip ?? 0) - advance - (paid ?? 0)), true)}</dd></div>}
  </dl>;
}

type SaveResult = string | void | Promise<string | void>;
type ProgressAction = 'taken' | 'served' | 'left' | 'ready' | 'draft';
type VisitPreferences = Partial<Pick<Visit, typeof returningVisitFields[number]>>;

type OrderEditorProps = {
  connected?: boolean;
  rememberCustomer?: (guest: import('../lib/demo').Guest) => void;
  order: Visit;
  update: (visit: Visit) => void;
  data: Database;
  cancel: () => void;
  save: (visit: Visit) => SaveResult;
  checkout: (visit: Visit) => SaveResult;
  addGuest: () => void;
  staff?: Staff[];
  atBillingDesk?: boolean;
  onProgress?: (visit: Visit, action: ProgressAction) => SaveResult;
};

const localClock = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(date);

export function OrderEditor({
  order, update, data, cancel, save, checkout, addGuest, staff, onProgress, atBillingDesk, connected = false, rememberCustomer,
}: OrderEditorProps) {
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'dishes' | 'visit'>('dishes');
  const [mobilePane, setMobilePane] = useState<'menu' | 'order'>(atBillingDesk && order.items.length ? 'order' : 'menu');
  const workspacePane = useRef<HTMLDivElement>(null);
  const [advance, setAdvance] = useState(order.advance ? String(order.advance.amount / 100) : '');
  const [advanceMethod, setAdvanceMethod] = useState<Method>(order.advance?.method ?? 'UPI');
  const [dishEditor, setDishEditor] = useState<Line | 'special'>();
  const [confirmLeft, setConfirmLeft] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [prefillGuestId, setPrefillGuestId] = useState('');
  const autoFilled = useRef<VisitPreferences>({});
  const autoFilledGuest = useRef('');

  const parcel = order.kind === 'Parcel';
  const preorder = order.source !== 'Walk-in';
  const upcoming = preorder && (order.status === 'Upcoming' || !order.takenAt && (!order.id || order.status === 'Draft'));
  const selectedTable = data.tables.find(table => table.id === order.table);
  const tableFirst = !parcel && !preorder && !selectedTable;
  const occupied = new Set(data.orders
    .filter(visit => visit.id !== order.id && occupiesTable(visit))
    .map(visit => visit.table));
  const registeredGuest = data.guests.find(guest => guest.id === order.guestId);
  const guestPhone = order.guestPhone ?? registeredGuest?.phone ?? '';
  const dishes = data.dishes.filter(dish => (!category || dish.category === category) &&
    dish.name.toLowerCase().includes(query.trim().toLowerCase()));
  const itemCount = order.items.reduce((count, line) => count + line.quantity, 0);
  const outstandingDishes = order.items.some(line => line.quantity > (line.servedQuantity ?? 0));
  const served = itemCount > 0 && !outstandingDishes;
  const advanceAmount = advance.trim() ? parseMoney(advance) : 0;
  const preview: Visit = {
    ...order,
    kind: parcel ? 'Parcel' : 'Dine-in',
    table: order.table,
    guestPhone: guestPhone.trim(),
    pickupTime: parcel ? order.pickupTime ?? (order.time || undefined) : order.pickupTime,
    advance: advanceAmount > 0 ? {
      amount: advanceAmount, method: advanceMethod, date: order.advance?.date ?? serviceDay(),
    } : undefined,
  };
  const paid = sumPayments(order.payments ?? []);
  const total = totals(order.items, order.taxRate ?? data.business.taxRate, order.discount).total + (order.tip ?? 0);
  const due = total - (preview.advance?.amount ?? 0) - paid;
  const paymentStatus = due < 0 ? 'Overpaid' : due === 0 && itemCount ? 'Paid' : preview.advance || paid ? 'Part paid' : 'Unpaid';

  function patch(values: Partial<Visit>) {
    update({ ...order, ...values });
    setError('');
  }

  function clearPreviousPreferences(guestId: string) {
    const cleared: VisitPreferences = {};
    if (guestId !== autoFilledGuest.current) {
      for (const field of returningVisitFields) {
        if (autoFilled.current[field] && autoFilled.current[field] === order[field]) cleared[field] = '';
      }
      autoFilled.current = {};
    }
    return cleared;
  }

  function changeGuest(values: Partial<Visit>) {
    setPrefillGuestId(values.guestId ?? '');
    patch({ ...clearPreviousPreferences(values.guestId ?? ''), ...values });
  }

  const applyPreferences = useEffectEvent((guestId: string, preferences: VisitPreferences) => {
    if (order.guestId !== guestId || saveLock.current) return;
    const fields: VisitPreferences = {};
    for (const field of returningVisitFields) {
      if (!order[field]?.trim() && preferences[field]) fields[field] = preferences[field];
    }
    if (Object.keys(fields).length) {
      autoFilled.current = fields;
      autoFilledGuest.current = guestId;
      patch(fields);
    }
  });

  const clearAfterCustomerCreated = useEffectEvent((guestId: string) => {
    const cleared = clearPreviousPreferences(guestId);
    if (Object.keys(cleared).length) patch(cleared);
  });
  useEffect(() => { clearAfterCustomerCreated(order.guestId); }, [order.guestId]);

  const demoPreferences = useEffectEvent((guestId: string) =>
    data.bills.filter(bill => !bill.voided && bill.order.guestId === guestId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0]?.order ?? {});

  useEffect(() => {
    if (!prefillGuestId) return;
    let active = true;
    if (connected) {
      workspaceRequest('customer-prefill/' + encodeURIComponent(prefillGuestId))
        .then(({ preferences }) => { if (active) applyPreferences(prefillGuestId, preferences); })
        .catch(() => { /* Visit details can still be entered by hand. */ });
    } else {
      applyPreferences(prefillGuestId, demoPreferences(prefillGuestId));
    }
    return () => { active = false; };
  }, [connected, prefillGuestId]);

  function validate(action: ProgressAction | 'checkout', arrive: boolean) {
    if (!Number.isFinite(advanceAmount)) return 'Enter a valid advance amount with up to two decimal places.';
    if (action === 'draft' && (!order.id || order.status === 'Draft' || order.status === 'Upcoming')) return;
    if (!parcel) {
      const extra = order.extraCovers ?? 0;
      if (!Number.isInteger(order.covers) || order.covers < 1 || order.covers > 99 || !Number.isInteger(extra) || extra < 0 || extra > 99) {
        return 'Enter 1–99 guests and a whole number of extra guests (0–99).';
      }
      if (!selectedTable && !(upcoming && action === 'taken' && !arrive)) return 'Select a dining table to continue.';
      if (selectedTable && order.covers + extra > selectedTable.seats) return 'Choose a larger table or reduce the guest count.';
      if (selectedTable && !order.guestLeftAt && occupied.has(selectedTable.id) && !(upcoming && action === 'taken' && !arrive)) {
        return 'That table already has an open order. Choose another table.';
      }
    }
    if (upcoming && (!order.guest.trim() || !order.date || !((parcel ? order.pickupTime ?? order.time : order.time)))) {
      return 'Enter the guest name and the appointment or pickup date and time.';
    }
    if (!itemCount && action !== 'draft' && !(upcoming && action === 'taken' && !arrive)) return 'Add at least one dish.';
  }

  async function submit(action: ProgressAction | 'checkout', arrive = false) {
    if (saveLock.current) return;
    const problem = validate(action, arrive);
    if (problem) {
      setError(problem);
      return;
    }
    saveLock.current = true; setSaving(true);
    try {
    const now = new Date();
    const at = now.toISOString();
    const visit: Visit = { ...preview, updatedAt: at };
    switch (action) {
      case 'draft':
        if (!order.takenAt && (order.status === 'Draft' || !order.id)) visit.status = 'Draft';
        break;
      case 'taken':
        if (upcoming && !arrive) visit.status = 'Upcoming';
        else {
          visit.status = 'Open';
          visit.takenAt ??= at;
          if (!parcel) visit.seatedAt ||= localClock(now);
        }
        break;
      case 'served':
        visit.items = order.items.map(line => ({ ...line, servedQuantity: line.quantity }));
        visit.servedAt = at;
        break;
      case 'left':
        visit.guestLeftAt ??= at;
        break;
      case 'ready':
      case 'checkout':
        visit.status = 'Open';
        visit.readyForBilling = true;
        visit.takenAt ??= at;
        break;
    }
    if (action === 'checkout') {
      setError(await checkout(visit) ?? '');
      return;
    }
    // Saving a future reservation must not run the parent's "taken" transition.
    const persist = visit.status === 'Upcoming' || !onProgress ? save : onProgress;
    setError(await persist(visit, action) ?? '');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save order.'); }
    finally { saveLock.current = false; setSaving(false); }
  }

  function changeQuantity(line: Line, delta: number) {
    const quantity = line.quantity + delta;
    if (quantity > 99 || quantity < (line.servedQuantity ?? 0)) return;
    if (delta > 0 && data.dishes.some(dish => dish.id === line.id && !dish.available)) return;
    patch({
      items: quantity ? order.items.map(item => item.id === line.id ? { ...item, quantity } : item)
        : order.items.filter(item => item.id !== line.id),
    });
  }

  function changeAssignee(id: string) {
    const next = staff?.find(member => member.id === id && member.active);
    if (!next || next.id === order.staffId) return;
    patch({ staffId: next.id, assigned: next.role });
  }

  function saveDish(line: Line) {
    const previous = order.items.find(item => item.id === line.id);
    patch({ items: previous ? order.items.map(item => item.id === line.id ? line : item) : [...order.items, line] });
    setDishEditor(undefined);
  }

  return <div className="order-workspace">
    <div className="ow-hero">
      <Title title={order.id ? 'Order ' + order.id : 'Take order'}
        subtitle={selectedTable && !parcel ? selectedTable.name + ' · ' + selectedTable.area : parcel ? 'Parcel' : 'Dine-in'}
        action={<button className="btn secondary" onClick={cancel}><ArrowLeft size={16} /> Orders</button>} />
      <div className="ow-statuses">
        <Badge tone={served ? 'green' : 'gray'}>{order.guestLeftAt ? parcel ? 'Parcel collected' : 'Guest left' :
          served ? parcel ? 'Packed' : 'Food served' : order.status === 'Draft' || !order.id ? 'Draft' :
          order.status === 'Upcoming' ? 'Upcoming' : order.servedAt ? 'Dishes pending' : 'Order taken'}</Badge>
        {order.readyForBilling && <Badge tone="blue">Ready for billing</Badge>}
        <Badge>{order.guestDetails ? 'Guest details ' + order.guestDetails.toLowerCase() : 'Guest details pending'}</Badge>
        <Badge tone={paymentStatus === 'Paid' ? 'green' : 'amber'}>{paymentStatus}</Badge>
      </div>
    </div>

    <section className="panel ow-context" aria-label="Order setup">
      <Field label="Service type"><select value={parcel ? 'Parcel' : 'Dine-in'} onChange={event => {
        const kind = event.target.value as Visit['kind'];
        patch({
          kind,
          table: kind === 'Parcel' ? '' : order.table,
          covers: kind === 'Parcel' ? 0 : order.covers || 2,
          extraCovers: kind === 'Parcel' ? undefined : order.extraCovers,
        });
      }}><option>Dine-in</option><option>Parcel</option></select></Field>
      <Field label="How did they order?"><select value={order.source} onChange={event => patch({
        source: event.target.value as Visit['source'],
      })}><option>Walk-in</option><option value="Phone pre-order">Phone</option><option>Online</option></select></Field>
      {parcel ? <Field label="Reference table (optional)"><select value={order.table} onChange={event => patch({ table: event.target.value })}>
        <option value="">No table</option>
        {data.tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
      </select></Field> : <Field label={selectedTable ? 'Move to table' : 'Dining table'}><select value={order.table}
        aria-required={!preorder} onChange={event => patch({ table: event.target.value })}>
        <option value="" disabled={!preorder}>{preorder ? 'Assign later' : 'Select a table'}</option>
        {!selectedTable && order.table && <option value={order.table} disabled>Table unavailable</option>}
        {data.tables.map(table => <option key={table.id} value={table.id}
          disabled={occupied.has(table.id) && !upcoming && table.id !== order.table}>
          {table.name} · {table.seats} seats{occupied.has(table.id) ? ' · Occupied now' : ''}
        </option>)}
      </select></Field>}
      {staff?.some(member => member.active) && <Field label="Assign to waiter"><select value={order.staffId ?? ''}
        onChange={event => changeAssignee(event.target.value)}>
        <option value="" disabled>Choose staff member</option>
        {staff.filter(member => member.active || member.id === order.staffId).map(member =>
          <option key={member.id} value={member.id} disabled={!member.active}>{member.name}{member.active ? '' : ' · Inactive'}</option>)}
      </select></Field>}
    </section>

    <div className="ow-steps" aria-label="Order workspace sections">
      <button className="btn secondary" aria-pressed={step === 'dishes'} onClick={() => setStep('dishes')}>Dishes <span>{itemCount}</span></button>
      <button className="btn secondary" aria-pressed={step === 'visit'} onClick={() => setStep('visit')}>Guest &amp; visit</button>
    </div>

    <div className="ow-grid" ref={workspacePane} data-step={step} data-pane={mobilePane}>
      {step === 'dishes' ? <section className="panel ow-menu" aria-label="Dish menu">
        <div className="section-head"><h2>Dish menu</h2><button className="btn secondary"
          disabled={tableFirst} onClick={() => setDishEditor('special')}><Plus size={16} /> Special dish</button></div>
        {tableFirst ? <Empty title="Choose a dining table" detail="Select where the guests are seated to start adding dishes." /> : <>
          <SearchInput value={query} onChange={setQuery} placeholder="Search dishes…" />
          <div className="chips">
            <button aria-pressed={!category} className={!category ? 'active' : ''} onClick={() => setCategory('')}>All dishes</button>
            {data.categories.map(name => <button key={name} aria-pressed={category === name}
              className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}
          </div>
          {dishes.length ? <div className="ow-menu-grid">{dishes.map(dish => {
            const line = order.items.find(item => item.id === dish.id);
            return <button key={dish.id} disabled={!dish.available || line?.quantity === 99} className="dish-card ow-dish"
              onClick={() => line ? changeQuantity(line, 1) : patch({
                items: [...order.items, { id: dish.id, name: dish.name, price: dish.price, quantity: 1 }],
              })}>
              <span className={'dish-kind ' + (dish.kind === 'Non-veg' ? 'meat' : '')}>{dish.kind}</span>
              <strong>{dish.name}</strong>
              <small>{dish.description}</small>
              <span className="dish-bottom"><b>{rupees(line?.price ?? dish.price, true)}</b>
                {dish.available ? <span className="ow-add"><Plus size={17} aria-hidden="true" /></span> : <span className="ow-sold-out">Sold out</span>}
              </span>
            </button>;
          })}</div> : <Empty title="No dishes match" detail="Try a different search or add a special dish." />}
        </>}
      </section> : <section className="panel ow-visit" aria-label="Guest and visit details">
        <div className="section-head"><h2>Guest details</h2><button className="btn secondary" onClick={addGuest}><Plus size={16} /> Add customer</button></div>
        <div className="ow-fields">
          <CustomerSearch guests={data.guests} connected={connected} selected={{ id: order.guestId, name: order.guest }} onSelect={guest => {
            if (guest) rememberCustomer?.(guest);
            changeGuest({ guestId: guest?.id ?? '', guest: guest?.name ?? '', guestPhone: guest?.phone ?? '', guestDetails: 'Pending' });
          }} />
          <Field label="Guest name"><input value={order.guest} onChange={event => changeGuest({
            guest: event.target.value, guestId: '', guestPhone, guestDetails: 'Pending',
          })} /></Field>
          <Field label="Guest phone"><input type="tel" value={guestPhone} onChange={event => patch({
            guestPhone: event.target.value, guestDetails: 'Pending',
          })} /></Field>
          <Field label="Details status"><select value={order.guestDetails ?? 'Pending'}
            onChange={event => patch({ guestDetails: event.target.value as Visit['guestDetails'] })}>
            <option>Pending</option><option disabled={!order.guest.trim()}>Collected</option><option>Skipped</option>
          </select></Field>
        </div>
        <h2>Visit details</h2>
        <div className="ow-fields">
          {!parcel && <>
            <Field label="Guests"><input type="number" min={1} max={99} value={order.covers || ''}
              onChange={event => patch({ covers: Number(event.target.value) })} /></Field>
            <Field label="Extra guests (only if listed separately)"><input type="number" min={0} max={99} value={order.extraCovers ?? ''}
              onChange={event => patch({ extraCovers: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
          </>}
          <Field label={parcel ? 'Pickup date' : 'Visit date'}><input type="date" value={order.date} onChange={event => patch({ date: event.target.value })} /></Field>
          {parcel ? <Field label="Pickup time"><input type="time" value={order.pickupTime ?? order.time} onChange={event => patch({ pickupTime: event.target.value })} /></Field> :
            <>
              <Field label="Appointment time"><input type="time" value={order.time} onChange={event => patch({ time: event.target.value })} /></Field>
              <Field label="Seated at"><input type="time" value={order.seatedAt} onChange={event => patch({ seatedAt: event.target.value })} /></Field>
            </>}
          <Field label="Meal session"><select value={order.session} onChange={event => patch({ session: event.target.value })}>
            {sessions.map(session => <option key={session}>{session}</option>)}
          </select></Field>
          {([['host', 'Host'], ['referral', 'Referred by'], ['pet', 'Pet name'], ['breed', 'Pet breed'],
            ['hometown', 'From / hometown'], ['stay', 'Place of stay in Yercaud'], ['nativity', 'Place of origin (optional, for the paper bill)'],
          ] as const).map(([key, label]) => <Field key={key} label={label}><input value={order[key] ?? ''}
            onChange={event => {
              if (key === 'hometown' || key === 'pet' || key === 'breed') delete autoFilled.current[key];
              patch({ [key]: event.target.value });
            }} /></Field>)}
          <Field label="Guest type"><select value={order.guestType ?? ''} onChange={event => patch({ guestType: event.target.value })}>
            <option value="">Unspecified</option><option>Room guest</option><option>Walk-in</option><option>Phone pre-order</option>
          </select></Field>
          <Field label="Relationship"><select value={order.relationship ?? ''} onChange={event => patch({ relationship: event.target.value })}>
            {['', 'Solo', 'Family', 'Friends', 'Girl Friend / ’s', 'Companion'].map(value => <option key={value} value={value}>{value || 'Unspecified'}</option>)}
          </select></Field>
          <Field label="Guest rating"><select value={order.rating ?? ''} onChange={event => patch({ rating: event.target.value })}>
            {['', 'Super friendly', 'Friendly', 'Unfriendly', 'Reserved', 'Arrogant', 'Pain in the neck'].map(value => <option key={value} value={value}>{value || 'Unspecified'}</option>)}
          </select></Field>
          <label className="ow-check"><input type="checkbox" checked={order.blacklist ?? false}
            onChange={event => patch({ blacklist: event.target.checked })} /> Blacklist</label>
          <Field label="Visit notes" wide><textarea rows={3} value={order.notes} onChange={event => patch({ notes: event.target.value })} /></Field>
        </div>
        <h2>Advance</h2>
        <div className="ow-fields">
          <Field label="Advance received (₹)"><input inputMode="decimal" placeholder="0.00" value={advance}
            onChange={event => {
              const value = event.target.value;
              setAdvance(value);
              const amount = parseMoney(value);
              patch({ advance: amount > 0 ? { amount, method: advanceMethod, date: order.advance?.date ?? serviceDay() } : undefined });
            }} /></Field>
          <Field label="Method"><select value={advanceMethod} onChange={event => {
            const method = event.target.value as Method;
            setAdvanceMethod(method);
            if (order.advance) patch({ advance: { ...order.advance, method } });
          }}>
            {methods.map(method => <option key={method}>{method}</option>)}
          </select></Field>
        </div>
      </section>}

      <section className="panel ow-basket" aria-label="Order summary">
        <div className="ow-basket-title"><h2>Order summary</h2><span className="count">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></div>
        {!itemCount && <Empty title="No dishes added" detail="Items you add from the menu appear here." />}
        <ul className="ow-lines">{order.items.map(line => {
          const soldOut = data.dishes.some(dish => dish.id === line.id && !dish.available);
          const servedCount = line.servedQuantity ?? 0;
          return <li className="ow-line" key={line.id}>
            <div className="ow-line-title"><strong>{line.name}</strong><b>{rupees(line.price * line.quantity, true)}</b></div>
            <div className="ow-line-controls">
              <small>{rupees(line.price, true)} each{soldOut && ' · Sold out'}{servedCount > 0 && ` · ${servedCount} ${parcel ? 'packed' : 'served'}`}</small>
              <div className="stepper">
                <button className="icon-button" aria-label={`${line.quantity === 1 ? 'Remove' : 'Decrease quantity of'} ${line.name}`}
                  disabled={line.quantity <= servedCount} onClick={() => changeQuantity(line, -1)}>
                  {line.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                </button>
                <span>{line.quantity}</span>
                <button className="icon-button" aria-label={'Increase quantity of ' + line.name} disabled={soldOut || line.quantity >= 99}
                  onClick={() => changeQuantity(line, 1)}><Plus size={15} /></button>
              </div>
            </div>
            {line.note && <p className="ow-line-note">{line.note}</p>}
            {line.priceReason && <small>{line.id.startsWith('special-') ? 'Reason' : 'Price change'} · {line.priceReason}</small>}
            <button className="ow-edit" aria-label={'Edit note or price for ' + line.name}
              onClick={() => setDishEditor(line)}><Pencil size={14} /> Note / price</button>
          </li>;
        })}</ul>
        <Totals order={preview} taxRate={data.business.taxRate} paid={paid || undefined} />
        {due < 0 && <p className="error">Recorded amount exceeds total by {rupees(-due, true)}.</p>}
        {error && <p className="error ow-error" role="alert">{error}</p>}
        <div className="ow-actions" inert={saving} aria-busy={saving}>
          <button className="btn secondary" onClick={() => submit('draft')}>{order.status === 'Draft' || !order.id ? 'Save draft' : 'Save changes'}</button>
          {upcoming ? <button className="btn secondary" onClick={() => submit('taken')}>Save pre-order</button> :
            (order.status === 'Draft' || !order.id) && <button className="btn secondary" onClick={() => submit('taken')}>Mark order taken</button>}
          {order.status === 'Upcoming' && (parcel || selectedTable) && <button className="btn secondary" onClick={() => {
            if (occupied.has(order.table)) { setError('Choose an available table before marking arrival.'); return; }
            submit('taken', true);
          }}>{parcel ? 'Start preparing' : 'Mark arrived'}</button>}
          {order.status === 'Open' && order.id && !order.guestLeftAt && <>
            {outstandingDishes && <button className="btn secondary" onClick={() => submit('served')}>{parcel ? 'Mark packed' : 'Mark food served'}</button>}
          </>}
          <button className="btn primary" onClick={() => submit(onProgress && !order.readyForBilling && !atBillingDesk ? 'ready' : 'checkout')}>
            {onProgress && !order.readyForBilling && !atBillingDesk ? 'Send to billing desk' : 'Checkout'} <ArrowRight size={16} />
          </button>
        </div>
        {order.status === 'Open' && order.id && !order.guestLeftAt && due > 0 && <details className="ow-departure-exception">
          <summary>Unpaid departure</summary>
          <p className="hint">Use when a customer leaves with money still due. The amount stays outstanding for follow-up.</p>
          <button className="text-button" onClick={() => setConfirmLeft(true)}>{parcel ? 'Record unpaid collection' : 'Record unpaid departure'}</button>
        </details>}
      </section>
    </div>
    {step === 'dishes' && <div className="ow-mobile-bar">
      <span><strong>{rupees(total, true)}</strong><small>{itemCount} {itemCount === 1 ? 'item' : 'items'}</small></span>
      <button className="btn primary" onClick={() => {
        setMobilePane(mobilePane === 'menu' ? 'order' : 'menu');
        requestAnimationFrame(() => workspacePane.current?.scrollIntoView({ block: 'start' }));
      }}>
        {mobilePane === 'menu' ? 'View order' : 'Back to menu'} <ArrowRight size={16} />
      </button>
    </div>}
    {dishEditor && <DishEditor line={dishEditor === 'special' ? undefined : dishEditor} close={() => setDishEditor(undefined)} save={saveDish} />}
    {confirmLeft && <Dialog title={parcel ? 'Record unpaid collection?' : 'Record unpaid departure?'} close={() => setConfirmLeft(false)}>
      <p className="ow-confirm">{due > 0 ? `This order still has ${rupees(due, true)} due. The balance stays on the order.` : 'The order and payment history stay available.'}</p>
      <div className="dialog-actions">
        <button className="btn secondary" onClick={() => setConfirmLeft(false)}>Go back</button>
        <button className="btn primary" onClick={() => { setConfirmLeft(false); submit('left'); }}>{parcel ? 'Mark collected' : 'Mark guest left'}</button>
      </div>
    </Dialog>}
  </div>;
}

function DishEditor({ line, close, save, priceOnly = false }: { line?: Line; close: () => void; save: (line: Line) => SaveResult; priceOnly?: boolean }) {
  const [name, setName] = useState(line?.name ?? '');
  const [price, setPrice] = useState(line ? (line.price / 100).toFixed(2) : '');
  const [note, setNote] = useState(line?.note ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const parsedPrice = parseMoney(price);
  const changed = !!line && parsedPrice !== line.price;
  const needsReason = !line || changed;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || (!line && parsedPrice === 0)) {
      setError('Enter a dish name and a valid price with up to two decimal places. A new dish must cost more than zero.');
      return;
    }
    if (needsReason && !reason.trim()) { setError('Enter a reason.'); return; }
    const failure = await save({
      id: line?.id ?? 'special-' + crypto.randomUUID(), name: name.trim(), price: parsedPrice,
      quantity: line?.quantity ?? 1, servedQuantity: line?.servedQuantity,
      note: note.trim() || undefined, priceReason: needsReason ? reason.trim() : line?.priceReason,
    });
    if (failure) setError(failure);
  }

  return <Dialog title={line ? (priceOnly ? 'Edit price · ' : '') + line.name : 'Add special dish'} close={close}>
    <form className="ow-dish-editor" onSubmit={submit}>
      {!line && <Field label="Dish name"><input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></Field>}
      <Field label="Unit price (₹)"><input required inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></Field>
      {priceOnly ? <p className="hint">This changes all {line?.quantity} units on this bill only. Enter ₹0 for a complimentary dish and add a reason.</p> :
        <Field label="Dish note"><textarea rows={2} maxLength={240} value={note} placeholder="e.g. Less spicy"
          onChange={event => setNote(event.target.value)} /></Field>}
      {needsReason && <Field label={line ? "Price change reason" : "Reason for adding dish"}><input required maxLength={240} value={reason} onChange={event => setReason(event.target.value)} /></Field>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="btn secondary" type="button" onClick={close}>Cancel</button>
        <button className="btn primary">{priceOnly ? 'Save price' : line ? 'Save dish' : 'Add dish'}</button></div>
    </form>
  </Dialog>;
}

const methodIcons = { Cash: Banknote, UPI: Smartphone, Card: CreditCard };

function DiscountEditor({ discount, role, limit, stale, close, save }: {
  discount?: Discount; role: Role; limit: number; stale: boolean; close: () => void;
  save: (input?: Pick<Discount, 'kind' | 'value' | 'reason'>, approve?: boolean) => SaveResult;
}) {
  const [kind, setKind] = useState(discount?.kind ?? 'percent');
  const [entry, setEntry] = useState(discount ? String(discount.kind === 'amount' ? discount.value / 100 : discount.value) : '');
  const [reason, setReason] = useState(discount?.reason ?? '');
  const [error, setError] = useState('');
  const readOnly = Boolean(discount?.pending && !stale);
  const submit = async (input?: Pick<Discount, 'kind' | 'value' | 'reason'>, approve?: boolean) => {
    setError(await save(input, approve) ?? '');
  };
  return <Dialog title="Bill discount" close={close}>
    <form className="ow-dish-editor" onSubmit={event => {
      event.preventDefault();
      if (readOnly) return;
      const amount = parseMoney(entry);
      submit({ kind, value: kind === 'percent' ? amount / 100 : amount, reason });
    }}>
      <p className="hint">Discounts reduce the dish subtotal before tax. Staff discounts over {limit}% require owner approval.</p>
      <Field label="Discount type"><select disabled={readOnly} value={kind} onChange={event => { setKind(event.target.value as Discount['kind']); setEntry(''); }}><option value="percent">Percentage</option><option value="amount">Fixed amount</option></select></Field>
      <Field label={kind === 'percent' ? 'Discount (%)' : 'Discount amount (₹)'}><input required readOnly={readOnly} inputMode="decimal" value={entry} onChange={event => setEntry(event.target.value)} /></Field>
      <Field label="Discount reason"><input required readOnly={readOnly} maxLength={240} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      {readOnly && role !== 'Owner' && <p className="hint">Ask the owner to reopen this order in Billing. You can withdraw the request to continue without a discount.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {discount && <button type="button" className="btn secondary" onClick={() => submit()}>{discount.pending ? 'Withdraw request' : 'Remove discount'}</button>}
        {readOnly ? role === 'Owner' && discount && <button type="button" className="btn primary" onClick={() => submit(discount, true)}>Approve discount</button> :
          <button className="btn primary" type="submit">{role === 'Owner' ? 'Apply discount' : 'Save or request approval'}</button>}
      </div>
    </form>
  </Dialog>;
}

export function Checkout({ order, taxRate, role, staffDiscountLimit, close, complete, onPaymentsChange, onTipChange, onDiscountChange, onLineChange }: {
  order: Visit;
  taxRate: number;
  role: Role;
  staffDiscountLimit: number;
  close: () => void;
  complete: (payments: Payment[]) => SaveResult;
  onPaymentsChange?: (payments: Payment[]) => SaveResult;
  onTipChange: (amount: number, payments?: Payment[]) => SaveResult;
  onDiscountChange: (input?: Pick<Discount, 'kind' | 'value' | 'reason'>, approve?: boolean) => SaveResult;
  onLineChange: (line: Line) => SaveResult;
}) {
  const [method, setMethod] = useState<Method>('UPI');
  const [payments, setPayments] = useState<Payment[]>(order.payments ?? []);
  const [amount, setAmount] = useState('');
  const [tipEntry, setTipEntry] = useState(order.tip ? (order.tip / 100).toFixed(2) : '');
  const [tipError, setTipError] = useState('');
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number>();
  const [priceLine, setPriceLine] = useState<Line>();
  const [discountEditor, setDiscountEditor] = useState(false);
  const [tipPayment, setTipPayment] = useState<{ amount: number; tip: number; method: Method }>();
  const issueLock = useRef(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function persist(action: () => SaveResult): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setSaving(true);
    try { const failure = await action(); if (failure) { setError(failure); return false; } setError(''); return true; }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Try again.'); return false; }
    finally { pending.current = false; setSaving(false); }
  }
  const paid = sumPayments(payments);
  const { subtotal, total: billTotal } = totals(order.items, order.taxRate ?? taxRate, order.discount);
  const staleDiscount = Boolean(order.discount && order.discount.subtotal !== subtotal);
  const discountBlocked = Boolean(order.discount?.pending || staleDiscount);
  const remaining = billTotal + (order.tip ?? 0) - (order.advance?.amount ?? 0) - paid;
  const draftTip = tipEntry.trim() ? parseMoney(tipEntry) : 0;
  const tipChanged = draftTip !== (order.tip ?? 0);
  const enteredAmount = amount.trim() ? parseMoney(amount) : 0;
  const tipFromPayment = enteredAmount + paid + (order.advance?.amount ?? 0) - billTotal;
  const canUseDifference = Number.isSafeInteger(enteredAmount) && enteredAmount > 0 && tipFromPayment > 0 &&
    tipFromPayment !== (order.tip ?? 0) && !tipChanged && !discountBlocked;
  const parcel = order.kind === 'Parcel';
  const invalidOrder = !order.items.length || (!parcel && !order.table);
  const canIssue = remaining === 0 && !tipChanged && !discountBlocked && !invalidOrder && !issued && order.status !== 'Billed' && order.status !== 'Cancelled';
  const guests = order.covers + (order.extraCovers ?? 0);
  const description = [order.guest || 'Guest', parcel ? 'Parcel' : `${guests} ${guests === 1 ? 'guest' : 'guests'}`].join(' · ');

  async function changePayments(next: Payment[]) {
    if (await persist(() => onPaymentsChange?.(next))) { setPayments(next); return true; }
    return false;
  }

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (discountBlocked || tipChanged) return;
    const paise = amount.trim() ? parseMoney(amount) : remaining;
    if (!(paise > 0 && paise <= remaining)) { setError('Enter a payment amount up to the remaining balance.'); return; }
    if (await changePayments([...payments, { amount: paise, method, date: serviceDay() }])) setAmount('');
  }

  async function issue() {
    if (!canIssue || issueLock.current) return;
    issueLock.current = true;
    const success = await persist(() => complete(payments));
    if (!success) {
      issueLock.current = false;
      return;
    }
    setIssued(true);
  }

  return <Dialog title="Checkout" description={description} close={close} large>
    <div className="ow-checkout" inert={saving} aria-busy={saving}>
      <section className="ow-checkout-summary" aria-label="Bill review">
      <details className="ow-checkout-review" open>
        <summary>Review dishes <span>{order.items.reduce((count, line) => count + line.quantity, 0)} items</span></summary>
        <ul>{order.items.map(line => <li key={line.id}><span>{line.quantity} × {line.name}<small className="checkout-unit">{rupees(line.price, true)} each</small></span><div className="checkout-line-actions"><b>{rupees(line.quantity * line.price, true)}</b><button className="text-button" aria-label={'Edit price for ' + line.name} onClick={() => setPriceLine(line)}><Pencil size={14} aria-hidden="true" /> Edit price</button></div></li>)}</ul>
      </details>
      <div className="checkout-discount">
        <button className="btn secondary" onClick={() => setDiscountEditor(true)}><Percent size={16} aria-hidden="true" /> {order.discount ? 'Review discount' : 'Add discount'}</button>
        {order.discount && <p className="hint">{staleDiscount ? 'Dish total changed. Review the discount before payment.' : order.discount.pending ? 'Waiting for owner approval. Payment is paused.' : 'Discount applied' + (order.discount.approver ? ' · Approved by ' + order.discount.approver : '')}</p>}
      </div>
      <Totals order={order} taxRate={taxRate} paid={paid} />
      </section>
      <section className="ow-checkout-payment" aria-label="Payment">
      <form className="ow-tip-form" onSubmit={async event => {
        event.preventDefault();
        if (!Number.isFinite(draftTip)) { setTipError('Enter a valid tip with up to two decimal places.'); return; }
        if (billTotal + draftTip < paid + (order.advance?.amount ?? 0)) {
          setTipError('Correct the recorded payments before reducing the tip.'); return;
        }
        if (await persist(() => onTipChange(draftTip))) { setTipError(''); setAmount(''); }
      }}>
        <Field label="Voluntary tip (₹)"><input inputMode="decimal" placeholder="0.00" value={tipEntry} onChange={event => { setTipEntry(event.target.value); setTipError(''); }} /></Field>
        <button className="btn secondary" disabled={!tipChanged}>Apply tip</button>
        {tipError && <p className="error" role="alert">{tipError}</p>}
      </form>
      {payments.length > 0 && <section aria-label="Recorded payments">
        <h3>Recorded payments</h3>
        {payments.map((payment, index) => <div className="payment-row" key={index}>
          <Check size={16} aria-hidden="true" /><span>{payment.method}</span><b>{rupees(payment.amount, true)}</b>
          <button className="icon-button" aria-label={`Remove ${payment.method} payment of ${rupees(payment.amount, true)}`}
            onClick={() => setRemoveIndex(index)}><Trash2 size={15} /></button>
        </div>)}
      </section>}
      {remaining === 0 && !invalidOrder && <p className="ow-paid" role="status"><Check size={16} /> Balance settled</p>}
      {remaining > 0 && !invalidOrder && <form onSubmit={record} className="ow-payment-form">
        <h3>Record payment</h3>
        <div className="pay-methods" role="group" aria-label="Payment method">
          {methods.map(name => {
            const Icon = methodIcons[name];
            return <button key={name} type="button" aria-pressed={method === name}
              className={method === name ? 'selected' : ''} onClick={() => setMethod(name)}><Icon size={19} />{name}</button>;
          })}
        </div>
        <Field label="Payment amount (₹)"><input inputMode="decimal" placeholder={(remaining / 100).toFixed(2)} value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} /></Field>
        <div className="ow-payment-actions">
          <button type="button" className="btn secondary" onClick={() => setAmount((remaining / 100).toFixed(2))}>Use remaining balance</button>
          <button className="btn primary" disabled={tipChanged || discountBlocked}>{amount.trim() ? 'Record payment' : 'Record full balance'}</button>
        </div>
        {canUseDifference && <div className="ow-change-tip">
          <div><strong>{rupees(enteredAmount, true)} received</strong><p>{order.tip ? 'Set the total tip to ' : 'Tip from the difference: '}{rupees(tipFromPayment, true)}{order.tip ? ' (currently ' + rupees(order.tip, true) + ')' : ''}.</p></div>
          <button type="button" className="btn secondary" onClick={() => setTipPayment({ amount: enteredAmount, tip: tipFromPayment, method })}>
            <HandCoins size={17} aria-hidden="true" /> Use difference as tip
          </button>
          <small>Confirm with the customer before adding a tip.</small>
        </div>}
        {enteredAmount > remaining && !tipChanged && <p className="hint">Extra received: {rupees(enteredAmount - remaining, true)}. Return it to the customer, or use the difference as a tip with their agreement.</p>}
      </form>}
      {remaining < 0 && <p className="error" role="alert">Recorded amount exceeds the bill by {rupees(-remaining, true)}. Correct the payments or advance before issuing.</p>}
      {invalidOrder && <p className="error" role="alert">Add dishes and select a dining table for dine-in before issuing the bill.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      </section>
      <div className="dialog-actions ow-checkout-actions">
        <button className="btn secondary" onClick={close}>Back to order</button>
        <button className="btn primary" disabled={!canIssue} onClick={issue}>{issued ? 'Bill issued' : 'Issue bill'} <ArrowRight size={16} /></button>
      </div>
    </div>
    {tipPayment && <Dialog title="Confirm tip and payment" close={() => setTipPayment(undefined)}>
      <p>Record {rupees(tipPayment.amount, true)} by {tipPayment.method} and set the total voluntary tip to {rupees(tipPayment.tip, true)}?</p>
      {!!order.tip && <p className="hint">This replaces the existing {rupees(order.tip, true)} tip.</p>}
      <div className="dialog-actions"><button className="btn secondary" onClick={() => setTipPayment(undefined)}>Go back</button>
        <button className="btn primary" disabled={saving} onClick={async () => {
          const next = [...payments, { amount: tipPayment.amount, method: tipPayment.method, date: serviceDay() }];
          if (!await persist(() => onTipChange(tipPayment.tip, next))) return;
          setPayments(next); setTipEntry((tipPayment.tip / 100).toFixed(2));
          setAmount(''); setError(''); setTipError(''); setTipPayment(undefined);
        }}>Confirm tip and record payment</button></div>
    </Dialog>}
    {priceLine && <DishEditor line={priceLine} priceOnly close={() => setPriceLine(undefined)} save={async line => {
      const problem = await onLineChange(line);
      if (problem) return problem;
      setPriceLine(undefined); setAmount(''); setError('');
    }} />}
    {discountEditor && <DiscountEditor discount={order.discount} role={role} limit={staffDiscountLimit} stale={staleDiscount}
      close={() => setDiscountEditor(false)} save={async (input, approve) => {
        const problem = await onDiscountChange(input, approve);
        if (problem) return problem;
        setDiscountEditor(false); setAmount(''); setError('');
      }} />}
    {removeIndex !== undefined && <Dialog title="Remove recorded payment?" close={() => setRemoveIndex(undefined)}>
      <p className="ow-confirm">The amount will be added back to the balance due.</p>
      <div className="dialog-actions">
        <button className="btn secondary" onClick={() => setRemoveIndex(undefined)}>Keep payment</button>
        <button className="btn danger" disabled={saving} onClick={async () => {
          if (await changePayments(payments.filter((_, index) => index !== removeIndex))) setRemoveIndex(undefined);
        }}>Remove payment</button>
      </div>
    </Dialog>}
  </Dialog>;
}

