const menuAdditions = [
  ['pepper-prawns', 'Pepper prawns', 'Seafood', 460, 'Non-veg', 'Black pepper, curry leaves and garlic'],
  ['fish-fry', 'Crispy fish fry', 'Seafood', 410, 'Non-veg', 'Pan-fried fish with toasted spices'],
  ['chicken-roast', 'Curry leaf chicken roast', 'Mains', 385, 'Non-veg', 'Slow-roasted chicken and curry leaves'],
  ['egg-curry', 'Egg masala', 'Mains', 235, 'Egg', 'Boiled eggs in a spiced onion gravy'],
  ['ghee-rice', 'Ghee rice', 'Sides', 155, 'Veg', 'Fragrant rice with ghee and whole spices'],
  ['bread', 'Malabar parotta', 'Sides', 65, 'Veg', 'Flaky griddled flatbread'],
  ['chicken-bites', 'Pepper chicken bites', 'Snacks', 260, 'Non-veg', 'Crisp chicken tossed with cracked pepper'],
  ['onion-fritters', 'Onion fritters', 'Snacks', 145, 'Veg', 'Crispy onion and gram flour fritters'],
  ['potato-wedges', 'Masala potato wedges', 'Snacks', 165, 'Veg', 'Spiced potato wedges with lime'],
  ['egg-puff', 'Egg puff', 'Snacks', 110, 'Egg', 'Flaky pastry with egg masala'],
  ['masala-tea', 'Masala tea', 'Drinks', 75, 'Veg', 'Milk tea with warming spices'],
  ['cold-coffee', 'Cold coffee', 'Drinks', 155, 'Veg', 'Chilled coffee shaken with milk'],
  ['ginger-fizz', 'Ginger lime fizz', 'Mocktails', 170, 'Veg', 'Ginger, fresh lime and soda'],
  ['passion-spritz', 'Passion fruit spritz', 'Mocktails', 195, 'Veg', 'Passion fruit, lime and sparkling water'],
  ['berry-cooler', 'Berry mint cooler', 'Mocktails', 185, 'Veg', 'Mixed berries, mint and soda'],
  ['tamarind-soda', 'Tamarind spice soda', 'Mocktails', 175, 'Veg', 'Tamarind, roasted cumin and soda', false],
  ['coconut-pudding', 'Coconut pudding', 'Desserts', 185, 'Veg', 'Chilled coconut milk pudding'],
  ['chocolate-cake', 'Warm chocolate cake', 'Desserts', 210, 'Egg', 'Warm slice with chocolate sauce'],
];

const guestNames = ['Ananya Raman', 'Rohan Menon', 'Neha Shah', 'Dev Iyer', 'Leela Anand', 'Kavya Pillai',
  'Mira Thomas', 'Sahil Joshi', 'Aditya Kumar', 'Ishita Rao', 'Arjun Nair', 'Tara Das'];

function offset(day, days) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

module.exports = async function seedDemo(connection, { initialData, emptyVisit, serviceDay, totals, payable, occupiesTable }) {
  const db = connection.db;
  const catalog = db.collection('restaurantcatalogs');
  if (await catalog.findOne({ _id: 'restaurant', seededBy: 'sweet-rascal-demo' })) {
    console.log('Demo fixtures already installed in sweet_rascal_demo.');
    return;
  }
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) {
    throw new Error('The demo seed requires an empty sweet_rascal_demo database.');
  }

  const dishes = [...initialData.dishes, ...menuAdditions.map(([id, name, category, rupees, kind, description, available = true]) =>
    ({ id, name, category, price: rupees * 100, kind, description, available }))];
  const categories = [...initialData.categories, 'Snacks', 'Mocktails'];
  const tables = initialData.tables;
  const business = { ...initialData.business, name: 'Sweet Rascal Demo', gstin: '', contactSync: false, staffDiscountLimit: 10 };
  const guests = guestNames.map((name, i) => {
    const sampleName = 'Sample ' + name;
    return { _id: 'demo-guest-' + (i + 1), name: sampleName, nameKey: sampleName.toLocaleLowerCase('en-IN'),
      phone: '', notes: 'Fictional demo customer.', contactNote: i === 0 ? 'Prefers a shaded table.' : '',
      companions: [], sync: 'No phone', assigned: 'Owner', revision: 0, changedBy: 'demo-seed' };
  });

  const today = serviceDay();
  const now = new Date();
  const at = (date, time) => new Date(date + 'T' + time + ':00+05:30').toISOString();
  const event = (id, action, time, detail) => ({ id, action, at: time, detail, actor: 'Demo staff' });
  const visit = (index, date, kind, table, guest, status, time) => {
    const id = 'OR-DEMO-' + String(index + 1).padStart(3, '0');
    return { ...emptyVisit('Staff', table), id, date, kind, time, session: 'Dinner',
      guestId: guest?._id ?? '', guest: guest?.name ?? '', guestPhone: '',
      guestDetails: guest ? 'Collected' : 'Pending', covers: kind === 'Parcel' ? 0 : 2,
      status, taxRate: business.taxRate, revision: 0, updatedAt: at(date, time) };
  };
  const orderRecord = order => ({ _id: order.id, status: order.status, table: order.table, occupied: occupiesTable(order),
    revision: order.revision, payload: order, createdAt: new Date(order.updatedAt), updatedAt: new Date(order.updatedAt) });
  const line = (id, quantity, served = 0) => {
    const dish = dishes.find(row => row.id === id);
    return { id, name: dish.name, price: dish.price, quantity, servedQuantity: served };
  };

  const bills = [], orders = [], refunds = [];
  const sampleMains = ['fish', 'chicken', 'mutton', 'pepper-prawns', 'chicken-roast', 'egg-curry'];
  const sampleDrinks = ['lime', 'coffee', 'ginger-fizz', 'passion-spritz', 'berry-cooler', 'cold-coffee'];
  for (let i = 0; i < 24; i++) {
    const date = offset(today, -Math.floor(i / 3));
    const time = ['12:30', '14:15', '19:45'][i % 3];
    const parcel = i % 4 === 1;
    const table = parcel ? '' : tables[i % tables.length].id;
    const guest = i < 2 ? undefined : guests[(i - 2) % guests.length];
    const order = visit(i, date, parcel ? 'Parcel' : 'Dine-in', table, guest, 'Billed', time);
    order.items = [line(sampleMains[i % sampleMains.length], 1, 1), line(sampleDrinks[i % sampleDrinks.length], 2, 2),
      line(i % 2 ? 'onion-fritters' : 'ghee-rice', 1, 1)];
    order.tip = i % 5 === 0 ? 5000 : 0;
    order.takenAt = at(date, time);
    order.servedAt = order.takenAt;
    const amount = payable(order, order.taxRate);
    order.payments = i % 4 === 0 ? [{ method: 'Cash', amount: 20000, date }, { method: 'UPI', amount: amount - 20000, date }]
      : [{ method: ['Cash', 'UPI', 'Card'][i % 3], amount, date }];
    if (guest?._id === guests[0]._id) Object.assign(order, { hometown: 'Salem', pet: 'Buddy', breed: 'Beagle' });
    const billId = 'SR-DEMO-' + String(i + 1).padStart(3, '0');
    order.events = [event(order.id + '-taken', 'Order taken', order.takenAt), event(order.id + '-issued', 'Bill issued', order.takenAt, billId)];
    const bill = { id: billId, date, time, order: structuredClone(order), payments: order.payments, business, taxRate: order.taxRate,
      tableName: tables.find(row => row.id === table)?.name };
    bills.push({ _id: billId, orderId: order.id, date, payload: bill, createdAt: new Date(order.updatedAt), updatedAt: new Date(order.updatedAt) });
    if (i !== 0) {
      order.guestLeftAt = order.takenAt;
      order.events.push(event(order.id + '-depart', parcel ? 'Parcel collected' : 'Guest departure confirmed', order.guestLeftAt));
    }
    if (i === 3 || i === 6) {
      const id = 'demo-refund-' + i;
      const summary = totals(order.items, order.taxRate);
      const cancelled = i === 6;
      const salesAmount = cancelled ? summary.total : 12500;
      const payload = { id, billId, amount: salesAmount, salesAmount, taxAmount: Math.round(2 * summary.tax * salesAmount / summary.total),
        tipAmount: 0, reason: cancelled ? 'Demo cancellation' : 'Demo partial refund', method: order.payments[0].method, cancelled, at: order.takenAt, actor: 'Demo owner' };
      refunds.push({ _id: id, billId, payload, createdAt: new Date(payload.at), updatedAt: new Date(payload.at) });
      order.events.push(event(order.id + '-refunded', cancelled ? 'Bill refunded and cancelled' : 'Refund recorded', payload.at, payload.reason));
    }
    orders.push(orderRecord(order));
  }

  const open = visit(24, today, 'Dine-in', 't2', guests[2], 'Open', '18:30');
  open.items = [line('chicken-bites', 1, 1), line('ginger-fizz', 2, 2)];
  open.readyForBilling = true;
  open.takenAt = open.updatedAt;
  open.servedAt = open.updatedAt;
  open.events = [event(open.id + '-ready', 'Waiting for bill', open.updatedAt)];
  const draft = visit(25, today, 'Parcel', '', undefined, 'Draft', '19:00');
  draft.items = [line('egg-puff', 2)];
  const preorder = visit(26, offset(today, 1), 'Parcel', '', guests[3], 'Upcoming', '19:30');
  preorder.source = 'Phone pre-order';
  preorder.pickupTime = preorder.time;
  preorder.items = [line('pepper-prawns', 2), line('berry-cooler', 2)];
  preorder.advance = { method: 'UPI', amount: 30000, date: today };
  preorder.updatedAt = now.toISOString();
  preorder.events = [event(preorder.id + '-advance', 'Advance recorded', preorder.updatedAt, '₹300 via UPI')];
  orders.push(...[open, draft, preorder].map(orderRecord));

  await connection.transaction(async session => {
    await catalog.insertOne({ _id: 'restaurant', seededBy: 'sweet-rascal-demo', payload: { dishes, categories, tables },
      revision: 0, createdAt: now, updatedAt: now }, { session });
    await db.collection('restaurantbusinesses').insertOne({ _id: 'restaurant', ...business, revision: 0,
      changedBy: 'demo-seed', createdAt: now, updatedAt: now }, { session });
    await db.collection('restaurantcustomers').insertMany(guests.map(guest => ({ ...guest, createdAt: now, updatedAt: now })), { session });
    await db.collection('restaurantorders').insertMany(orders, { session });
    await db.collection('restaurantinvoices').insertMany(bills, { session });
    await db.collection('restaurantrefunds').insertMany(refunds, { session });
  });
  console.log(`Seeded sweet_rascal_demo with ${dishes.length} dishes and drinks, ${tables.length} tables, ${guests.length} customers, ${orders.length} orders, ${bills.length} bills and ${refunds.length} refunds.`);
};
