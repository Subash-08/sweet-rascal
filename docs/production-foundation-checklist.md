> Current update: server-side history, Overview summaries, Reports, CSV exports and linked customer bill search are implemented. See [history-and-reporting-phase.md](history-and-reporting-phase.md) for the latest changes and manual checks.

> Update: real page routes and MongoDB operational persistence have now been added. See [database-and-routing-checklist.md](database-and-routing-checklist.md) for the current implementation, seed command, limitations and checks. Earlier session-preview boundaries below describe the previous phase.

# Implementation report and manual checks

## What changed in this step

- Added project-local Vercel React best-practices and web-design skills from vercel-labs/agent-skills. They are available in .agents/skills for later turns.
- Updated Next.js to the patched 16.4.6 release and added Mongoose, Zod and server-only boundaries.
- Added a cached MongoDB connection, typed models and declared indexes. The first owner setup creates indexes without dropping existing ones.
- Added individual sign-in, salted password hashing, opaque database sessions, login-attempt limits, same-origin mutation checks, Owner/Staff authorization, sign-out and disabling staff accounts.
- Added ten-result customer search and cursor pagination. Full customer details are fetched only when opened. Private owner notes are omitted from staff responses.
- Added connected customer/settings saves, revision conflict checks and MongoDB storage for the encrypted Google connection. Connected mode uses the real application session for contact access.
- Added a customer search picker with keyboard support, cancellation of superseded requests, loading/error/empty feedback and touch-friendly results.
- Added saved GST rates per order. Settings changes affect new orders. Invoices keep their original rate and snapshot.
- Split Overview summaries from date-filtered Sales/Refunds/Activity reports with matching CSV exports.
- Added a simple full/partial Refund / cancel workflow and linked adjustment history in the billing prototype. Split Cash/UPI/Card payments remain supported.

## Current boundary

The connected test workspace persists accounts, customers, settings and the Google connection. Billing, orders, menu/table editing and refund adjustments are still a session preview in connected mode. The browser demo retains its existing browser-local persistence. Completing the operational and billing backend in the production plan is required before launch.

Real Atlas credentials and the live Google consent/phone-sync flow require a separate environment verification. Automated tests with a temporary MongoDB replica set validate the backend without touching restaurant data.

## Verification completed

- Production build and TypeScript checks passed on Next.js 16.4.6.
- All 13 application pages passed horizontal-overflow checks at 320, 390, 820 and 1440 CSS pixels.
- Browser checks passed for partial/full refund and cancellation, immutable issued invoice data, CSV export and spreadsheet-formula escaping, GST snapshots and keyboard customer selection.
- Temporary MongoDB replica-set tests passed for owner bootstrap/login, staff authorization, same-origin mutation protection, disabling-account session revocation, customer creation/editing, stale-revision rejection, private-note protection and cursor pagination.
- The customer-name query plan used an index. Encrypted Google connection storage round-tripped through MongoDB and a concurrent mutation lock was rejected as expected.
- Mobile Reports was visually inspected after collapsing its advanced filters. Live Atlas reachability, Google consent and phone delivery remain manual environment checks.

## Environment to fill in

Use .env.example as the list of variable names. Keep credentials in .env.local locally and Vercel Production settings when deployed.

- MONGODB_URI — Atlas connection string.
- MONGODB_DB — sweet_rascal, or your selected database name.
- APP_ORIGIN — http://localhost:3000 locally, or the live HTTPS origin on Vercel.
- OWNER_EMAIL, OWNER_NAME, OWNER_PASSWORD — initial owner account. The password must have at least 12 characters. The account is created on its first successful sign-in.
- Existing Google Client ID, Client Secret, account email, CONTACTS_ORIGIN and CONTACTS_STORAGE_KEY — contact connection settings. In connected mode, application sign-in supplies contact permissions.

The initial-owner password is hashed into MongoDB. Changing OWNER_PASSWORD later does not reset an existing account. A password-change/recovery flow is a release task before daily use.

Restart the local server after adding environment values. Redeploy Vercel after setting its environment values. Atlas must permit the server connection. Use a separate test database for manual trials.

## Manual review

1. Sign in as the Owner. Open Staff & access and create a Staff account. Sign in to a second browser as Staff. Verify Reports and Settings cannot be opened through either the menu or their APIs.
2. Add at least 12 dummy customers in the test database. Check Next/Previous in Customers. Search by a name prefix and a phone prefix. No request should return the entire customer database.
3. Open an order's guest details. Type two characters into Find customer, select a result using touch, then repeat with ArrowDown and Enter. Clear it and check that manual guest entry is possible.
4. Edit one customer from two browsers. Save one version, then save the older version. The second save should report a conflict. Reopen the customer to load the current record.
5. Add private owner notes. Verify Staff can save contact information without seeing or erasing those notes.
6. Enable automatic contact sync, connect the restaurant Google account as Owner, then save a dummy customer as Staff. Check Google Contacts and the phone. Disable network or revoke access and verify customer save succeeds while sync can be retried.
7. Create an order with the current GST. Change the GST rate in Settings, then reopen that order. Its original rate should remain. A new order should show the changed rate. Check that an issued invoice keeps its original GSTIN and tax.
8. Use two payment methods to settle a bill. Record an explicit tip and check the balance. Refund part of the collected amount, then the remainder. Verify that another refund is blocked and the original invoice remains.
9. In Reports, filter dates, service and payment method. Search for one bill and download CSV. Check that the export matches the selected records. Repeat for Refunds and Activity.
10. Check Overview, order selection, checkout, refund dialog, Reports and login at 320/390 px, tablet portrait/landscape and desktop widths. Open the phone keyboard and verify action buttons remain reachable. Test keyboard focus and visible labels.
11. Test sign-out and disabling a Staff account. An existing disabled-account session must lose server access.
12. Before launch, complete server-side order/payment/invoice migration, verify tax adjustment documents with the accountant, run a restaurant pilot, and perform a backup restore.

On phones, use the Reports Filters button to expand date, service and payment-method fields. Quick date ranges and search remain directly accessible.

## References

- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Mongoose with Next.js](https://mongoosejs.com/docs/nextjs.html)
- [MongoDB atomic operations and transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [CBIC tax invoice and adjustment context](https://cbic-gst.gov.in/gst-invoice-rules.html)
