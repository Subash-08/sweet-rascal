/* Run explicitly with npm run db:seed. Never runs on app startup. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const mongoose = require('mongoose');
const ts = require('typescript');
require('@next/env').loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Add MONGODB_URI to .env.local or .env first.');
  const filename = path.resolve('lib/demo.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const source = new Module(filename, module);
  source.filename = filename;
  source.paths = module.paths;
  source._compile(compiled, filename);
  const { initialData } = source.exports;
  const demo = process.argv.includes('--demo');
  const dbName = demo ? 'sweet_rascal_demo' : process.env.MONGODB_DB?.trim() || 'sweet_rascal';
  await mongoose.connect(process.env.MONGODB_URI, { dbName, serverSelectionTimeoutMS: 10000, autoIndex: false });
  const db = mongoose.connection.db;
  if (demo) return require('./seed-demo.cjs')(mongoose.connection, source.exports);
  const now = new Date();
  const menu = await db.collection('restaurantcatalogs').updateOne({ _id: 'restaurant' }, { $setOnInsert: {
    payload: { dishes: initialData.dishes, categories: initialData.categories, tables: initialData.tables }, revision: 0, createdAt: now, updatedAt: now,
  } }, { upsert: true });
  await db.collection('restaurantbusinesses').updateOne({ _id: 'restaurant' }, { $setOnInsert: {
    ...initialData.business, contactSync: false, staffDiscountLimit: 10, revision: 0, changedBy: 'explicit-seed', createdAt: now, updatedAt: now,
  } }, { upsert: true });
  let inserted = 0;
  for (let index = 0; index < 3; index++) {
    const id = 'guest-00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0');
    const name = 'Sample ' + initialData.guests[index].name;
    const result = await db.collection('restaurantcustomers').updateOne({ _id: id }, { $setOnInsert: {
      name, nameKey: name.toLocaleLowerCase('en-IN'), phone: '', notes: 'Sample record for testing. Replace with a real customer when ready.',
      contactNote: '', companions: [], sync: 'No phone', assigned: 'Owner', revision: 0, changedBy: 'explicit-seed', createdAt: now, updatedAt: now,
    } }, { upsert: true });
    inserted += result.upsertedCount;
  }
  // The same operational indexes are also installed when the first owner logs in.
  await db.collection('restaurantcustomers').createIndex({ nameKey: 1, _id: 1 });
  await db.collection('restaurantcustomers').createIndex({ phone: 1, _id: 1 });
  await db.collection('restaurantorders').createIndex({ occupied: 1, table: 1 });
  await db.collection('restaurantorders').createIndex({ requestId: 1 }, { unique: true, sparse: true });
  await db.collection('restaurantorders').createIndex({ status: 1, updatedAt: -1 });
  await db.collection('restaurantinvoices').createIndex({ orderId: 1 }, { unique: true });
  await db.collection('restaurantinvoices').createIndex({ date: -1, _id: -1 });
  await db.collection('restaurantrefunds').createIndex({ billId: 1, createdAt: -1 });
  console.log(menu.upsertedCount ? 'Added 10 sample dishes, 5 categories and 8 tables.' : 'Existing menu and tables kept unchanged.');
  console.log('Added ' + inserted + ' sample customers. Existing records kept unchanged.');
  console.log('No orders, payments, invoices or Google contacts were created. Reload the app to see the samples.');
}
main().catch(() => { console.error('Seed failed. Check MongoDB access, the database name and network permissions. Credentials have not been logged.'); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
