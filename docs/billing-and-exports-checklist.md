# Sweet Rascal billing and exports checklist

Use a staging database and sign in as both Owner and Staff. To load sample data, set `MONGODB_URI` and `MONGODB_DB` to the staging database and run `npm run db:seed`. The seed adds ten dishes, eight tables, and three sample customers without phone numbers to an empty database. The sample menu and tables are added only if there is no catalog. Existing records are kept. Create test orders and issue bills on staging to populate the reports.

1. **Billed guest.** As Staff, serve an anonymous walk-in, take payment, and issue its bill. As Owner, open Orders, search for the recent order by its number, and select **Link customer**. Find an existing customer or add one, double-check the name and phone, and confirm. Open that customer and check **Previous bills**. Open the bill and confirm the original invoice still shows its issued details. Use **Search customer bills** for older records. Refresh and verify the link action is gone. Check that a bill already associated with a customer, a bill already showing a guest name or phone, and a cancelled bill cannot be linked. Check that Staff cannot make the link and only sees today's bills in the customer preview.
2. **Returning guest.** Complete a test visit with a linked customer, a hometown, and pet details. Select that customer in a new order. Check that the customer’s current name and phone and the previous visit’s hometown, pet name, and breed fill in. Enter a value before selecting the customer, switch to a different guest, and check that manual entries are kept and values auto-filled for the previous guest are cleared. Verify that table, visit timing, dishes, payments, and notes are entered for the current visit.
3. **Reports and contacts.** In Reports, apply a date range and a service or payment filter. Download Excel and CSV and compare the bills and totals against the filtered report across pages. Excel supports up to 10,000 records per download. Use CSV or narrower filters for larger exports. Try a filter with no matches. In Customers, search by name and phone then download as Owner. Confirm the customer export uses the current search and excludes internal customer notes. Check that Staff cannot export customers or open Reports.
4. **Activity.** Open Activity and confirm it starts with the last seven days and up to ten events. Use **Load older** for the next group or widen the dates to find older events. Switch tabs or filters quickly while a request is loading and check that the new selection displays correctly. Confirm a customer link and a refund appear in the activity.
5. **Refund.** Open the issued bill as Owner and choose **Refund / cancel bill**. After returning the money through the appropriate payment method, record the amount, method, and reason. Try a partial refund and then the rest. Verify that a refund above the remaining refundable balance is rejected. Confirm that cancelling requires recording the full remaining refund, and that the original invoice is preserved and the refund appears in Reports.
6. **Departure.** After a guest pays, check that the table stays occupied. Confirm departure after the guests leave and the table is ready, then seat another party. Check that a parcel uses **Mark collected** and that **Guest left without paying** is reserved for an unpaid departure.
7. **Screen sizes.** Check Orders, the customer picker, and report exports on a phone, tablet, and desktop. On desktop, verify that the bottom borders of the sidebar logo area and the top header align. On mobile, use the bottom navigation to move between Orders, Billing, and Bills.

## Full demo dataset

Run `npm run db:seed:demo` to populate the separate `sweet_rascal_demo` database on the configured MongoDB connection. For a local preview on port 3001, set these variables in a separate PowerShell session before starting the app.

```powershell
$env:MONGODB_DB = 'sweet_rascal_demo'
$env:APP_ORIGIN = 'http://localhost:3001'
$env:CONTACTS_ORIGIN = 'http://localhost:3001'
npm run dev -- --port 3001
```

Sign in to the demo with the configured Owner credentials. The demo has its own sign-in session and can share a browser with the main local app. On the demo's first run, **Sample Ananya Raman** has two previous bills. In Orders, `OR-DEMO-001` is an anonymous paid dine-in still occupying Xanadu. Use it to check customer linking and departure. The demo also includes a parcel draft, a phone preorder with a recorded advance, split payments, tips, and partial and full refunds.
