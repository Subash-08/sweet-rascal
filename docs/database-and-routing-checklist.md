> Next-phase update: history and reporting now run on the server. See [history-and-reporting-phase.md](history-and-reporting-phase.md). The all-history loading limitation described below has been resolved.

# Real pages, database data and testing

## What changed

- Routes now use `/staff-access`, `/orders`, `/billing-desk`, `/menu`, etc. Each has a page folder under `app/(workspace)`. The shared layout keeps the signed-in workspace and in-progress order mounted during normal navigation.
- `/` redirects to `/overview`. Old links such as `/#staff-access` are upgraded to their new path. Desktop navigation stays in the sidebar; mobile/tablet navigation stays at the bottom.
- A small `page.tsx` is valid Next.js code. Putting each screen in its own route folder is preferable here because pages have their own URLs, browser history and direct links. Reusable components and the workspace layout prevent duplication. This is an incremental migration: the shared workspace still coordinates the existing screens rather than rebuilding them all.
- Connected mode no longer starts with prototype dishes, tables, orders or bills. MongoDB supplies the catalog, table definitions, saved orders, invoices, refunds, staff, customers and restaurant settings. Overview and Reports calculate from these saved records. Your profile name also saves to MongoDB.
- Database errors show an error/retry state, rather than falling back to sample restaurant records. The explicitly labeled browser demo remains available when MongoDB is not configured.
- Menu/table edits wait for the server before reporting success. Category renames update the catalog's linked dishes atomically. Existing order lines and invoices keep their saved names and prices.
- Order saves, table occupancy, invoice issuance and refunds run through authenticated server commands. Conflicting edits are rejected. Reopen after using the refresh button to load the newest record.
- The server rechecks sold-out items, price-change reasons, discounts and owner approval, GST snapshots, payments and the remaining refundable amount. Amounts are integer paise.
- Bill numbers are assigned by a transaction-protected financial-year counter, for example `SR2627/000001`. An order can have only one invoice. Retrying issuance returns the already issued invoice.
- Original invoices are kept unchanged. Departures, refund records and cancellation records remain separate. Confirm a refund only after actually returning the money; the app does not move money through a payment gateway.
- New-order and refund requests keep an identifier during retries. A failed response should not create an extra order, invoice or refund.
- Added indexes for active table occupancy, order state/update time, unique invoice order, invoice date and refund bill reference. Existing customer name/phone prefix indexes remain.

## Add sample data

From the project directory, run:

```powershell
npm run db:seed
```

The command uses `MONGODB_URI` and `MONGODB_DB` from your environment. It explicitly adds:

| Data | Count |
| --- | ---: |
| Dishes | 10 |
| Categories | 5 |
| Dining tables | 8 |
| Sample customers | 3 |

The catalog is inserted only when there is no catalog. Existing menu/table data is preserved. Sample customer IDs are fixed, so repeating the command does not create duplicates or overwrite edited customers. Sample customers have blank phone numbers and no Google synchronization. No orders, invoices, advances, payments, refunds or staff passwords are seeded.

Review sample prices and table names before real service; they are test examples. The command has been tested against an isolated temporary database. It has not been run against your configured restaurant database.

Restart `npm run dev` after changing environment variables. Sign in with `OWNER_EMAIL` and `OWNER_PASSWORD`. On Vercel, add the variables to the appropriate deployment environment and redeploy.

Use MongoDB Atlas or a local MongoDB replica set. Order saves, invoice numbering and refunds use database transactions; a standalone local MongoDB server does not support these workflows.

## GST

5% is not hard-coded as the only available application rate. In Settings, the owner can edit **CGST and SGST (% each)**. Entering `2.5` means total GST of `5%`; entering `0` means no tax in the application's calculation. Use the rate appropriate to your business.

The first server save assigns an order's rate. Subsequent setting changes affect newly saved orders; saved orders and issued invoices retain their own rate. The server requires a valid-format GSTIN before issuing a taxable invoice. This field validates format, not the business's tax registration or applicable tax treatment.

## Manual checks

1. Open `/staff-access` directly. Check that the URL has no `#`. Open an old `/#staff-access` bookmark and check it moves to the new URL. Check Back/Forward and refresh.
2. Before seeding an empty database, confirm Food & Pricing and Tables have no sample rows. Run the seed command twice, then reload: expect 10 dishes, 8 tables and 3 customers, without duplicates or fake sales.
3. Add a category and dish. Edit the price and mark it sold out. Refresh and verify the changes remain. Rename a category and verify its dishes move with it.
4. Add/edit a table. Take an order, save a draft and reload. Reopen the draft and verify its dishes, notes, guest selection and advance.
5. Open the same order in two browsers. Save in one, then save the older copy in the other. Expect a conflict message. Use **Refresh restaurant data** and reopen before saving again.
6. Try claiming one table from two devices. Only one active order should claim it. Check parcel orders need no table and phone pre-orders can assign one later.
7. Edit a billing price with a reason. Check subtotal, discount, GST and balance. Try adding sold-out food and a staff discount over the limit; expect rejection or owner approval.
8. Record Cash + UPI/Card split payments. Test applying a tip and **Use difference as tip**. Do not issue until the full balance is recorded. Confirm that refreshing a saved order preserves recorded payments.
9. Issue a bill, reprint/download it and reload. Its amount, dishes, guest details and GST must remain the same after menu/settings changes. Confirm departure only after guests leave; check the table becomes available.
10. Record a partial refund, reopen the bill, then refund its remaining amount. Check the original invoice, refund history and report export. Staff should not be able to refund or change owner settings.
11. Change GST in Settings. Compare a previously saved order, a newly saved order and an existing invoice. Only the new order should use the new rate.
12. Check Orders, Billing, Bills and Food & Pricing at phone, tablet and desktop widths. Check that the bottom menu appears only on compact screens and the More menu opens upward.
13. Save a profile name and reload. Create a staff account, refresh the workspace and verify that the waiter selection lists the active account.

## Next production steps

1. Run the above checks on your Atlas-backed staging deployment, including Google consent and a real phone sync. These external credentials and device settings are environment-specific.
2. Move growing order/invoice history and report aggregation to date-bounded server queries with pagination. The current connected workspace loads operational history for the existing client reports; it is not yet optimized for years of records.
3. Complete deployment hardening: database backups/restore drill, application error monitoring, account recovery and session handling review, and a realistic concurrent-device load test.
4. Validate printed invoices and the supporting tax-adjustment documents required for your actual business before launch. Refund recording itself does not generate a statutory credit note.
5. Implement offline billing separately after the online workflow is stable. No offline billing or delayed synchronization was added in this step.

## Verification completed

- `npm run build` and `npm run check` passed.
- Isolated MongoDB replica-set tests passed for an empty database, repeatable seed, role checks, stable creation retries, competing table claims, sold-out food, price reasons, stale revisions, GST snapshots, owner-approved discounts, Cash/UPI split payments, tips, duplicate issuance, invoice immutability, departure, refunds and profile persistence.
- A real browser flow saved a parcel draft, reopened it at Billing, applied a tip, recorded payment, issued an invoice and verified the saved bill after refresh.
- All 13 pages passed horizontal-overflow and navigation-breakpoint checks at 320, 390, 820 and 1440 CSS pixels. Old hash links and the mobile More menu were also tested. No browser runtime errors were observed in those checks.
- Mobile checkout, mobile menu and desktop menu screenshots were visually reviewed.
- Required database/owner environment variables were checked for presence only. Live Atlas connectivity, Google consent/phone synchronization, printer output and production load remain environment/manual checks.
