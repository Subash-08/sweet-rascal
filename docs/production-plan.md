> Current update: server-side history, Overview summaries, Reports, CSV exports and linked customer bill search are implemented. See [history-and-reporting-phase.md](history-and-reporting-phase.md) for the latest changes and manual checks.

> Update: real page routes and MongoDB operational persistence have now been added. See [database-and-routing-checklist.md](database-and-routing-checklist.md) for the current implementation, seed command, limitations and checks. Earlier session-preview boundaries below describe the previous phase.

# Sweet Rascal production implementation plan

This plan follows the restaurant-only scope, Owner and Staff access, split payments across Cash / UPI / Card, and sales reporting. Offline billing is a later implementation.

## Current implementation step

The first connected test workspace supports individual sign-in, staff access management, indexed customer search and customer saves, shared restaurant/GST settings, and MongoDB storage for the encrypted Google Contacts connection. Adding MONGODB_URI selects this workspace. Without it the existing browser demo remains available.

Orders, payments, invoice issuance, refunds, menu changes and table changes still use the interface prototype in this step. The connected test workspace starts with empty orders and bills and explicitly labels billing as a session preview. Do not use it for production service yet. Migrating an entire browser database into Atlas automatically would copy sample records and trust browser-provided money and permissions. Instead migrate each operational endpoint with server validation in the next step.

## Implementation sequence

| Step | Scope | Completion condition |
| --- | --- | --- |
| 1 — foundation | Patched Next.js, MongoDB/Mongoose, secure sessions, Owner/Staff authorization, paginated customer directory, search picker, settings and Google connection storage | Sign in with separate Owner and Staff accounts. Save a customer from one browser and find it from another. Staff cannot change protected settings. |
| 2 — shared operations | Persist dishes, categories, tables, orders and drafts. Snapshot GST and line prices at order creation. Store actor IDs and server timestamps. Add revision checks for simultaneous edits and availability validation | Two devices can collaborate without overwriting updates or allocating one table to two active visits. Existing order prices and GST survive catalog changes. |
| 3 — billing | Server-calculated totals, split payments, advances, explicit tips, invoice counter and unique index, duplicate-request protection, paid-order settlement | Retried requests produce one payment or invoice. Multiple payments settle one bill. Issued invoice snapshots cannot be rewritten. |
| 4 — simple corrections | One Refund / cancel action, full or partial amount, method, reason and confirmation. Append a linked adjustment to an issued bill. For an unissued order, cancel and return any advance through the same understandable flow | Never refund more than the collected amount remaining. Repeated requests cannot refund twice. Owner reports and invoice history show the adjustment. |
| 5 — shared reporting | Server date filters, paginated records, CSV exports, sales/refund/event queries and owner-only aggregation | Overview and reports reconcile from the same authoritative transactions. Filters and downloads match. |
| 6 — release | Real-device responsive tests, printers/PDF, session expiry, concurrent requests, monitoring, backup and tested restore, restaurant pilot | The owner approves an end-to-end service pilot and recovery test. |

The initial plan keeps refund confirmation with the Owner. Staff can settle bills using multiple payment methods. If the Owner chooses to delegate refunds later, change the server permission and the UI together.

## UI and workflow

- Phone and compact tablet navigation uses Tables, Orders, Billing, Bills and More. More opens a bottom sheet. Wide layouts keep the sidebar.
- The customer picker searches after two characters, waits 250 ms after typing and cancels superseded requests. It returns at most ten matching names and numbers. It supports keyboard navigation and readable loading/empty/error feedback.
- The customer directory requests ten records per page. Opening one record loads its details. Private owner notes are excluded from staff responses and search results.
- Order entry prioritizes available dishes, selected quantities and a visible total. Keep the Sold out label and block additions. A later Available / All filter can hide unavailable dishes by default.
- Overview is the daily operating summary, with net sales, bills, guests, a sales trend, open/upcoming orders, top dishes and recent bills.
- Reports is a record workspace with Sales, Refunds and Activity tabs, date/service/payment-method filters, search and CSV download. It has no cash-counting or bank-account ledger.
- Refund / cancel uses full or partial amount, method, reason and confirmation after the money is returned. The original invoice is retained, while the adjustment appears in its history. Final backend billing must generate the accountant-approved supporting document when a tax adjustment is required.

## GST edit rules

The Owner edits GSTIN and CGST/SGST rates in Settings. Each order keeps its rate when first created or saved. Changing Settings affects new orders. An issued bill keeps the original tax rate, amounts, business details, guest details and line prices.

Use integer paise. Validate rates and GSTIN on both client and server. Show the total GST to avoid mistaking 2.5% per component for 2.5% overall. Final tax and credit-note treatment must be confirmed for this business with its accountant before production release.

## Feature dependency map

| Change | Must update or verify |
| --- | --- |
| Dish availability | Order search, Add/quantity actions, server order validation, existing ordered quantities |
| Catalog price | New lines only, catalog display and API validation. Old lines and invoices use snapshots |
| Order-line price or quantity | Subtotal, GST, discount review, tip/payment balance, invoice, sales records and audit event |
| Customer details | Directory, picker, saved guest reference, Google sync job. Issued invoice guest data remains its snapshot |
| GST settings | New order snapshot, checkout rate labels, invoice calculation, sales/GST report. Open-order rates stay saved |
| Discount | Approval limit, owner permission, taxable total, payable balance, invoice and sales report |
| Tip | Payment balance, invoice, refund allocation and tip summary. Tips remain separate from food sales |
| Payment | Balance, split-payment rows, ability to issue bill, refund allowance, audit event |
| Refund/cancellation | Available refundable balance, bill status/history, sales adjustment, refund report/export and required supporting document |
| Staff access | Server session, API permissions, navigation, approval actions and audit identity |
| Table movement | Occupancy, order label, waiter workspace and event history |
| Invoice issuance | Transactional number allocation, immutable snapshot, order status, PDF, reports and correction reference |

Keep these calculations in shared domain functions. Add targeted regression tests for every change to money, tax, state transitions or permissions. Do not calculate report revenue differently in each component.

## Indexes and query limits

Current foundation indexes cover unique user email, session expiry and user ID, customer name-prefix search, phone-prefix search, customer update order, integration locks, login-attempt expiry and audit history.

For operational migration, add indexes for order status/date, assigned waiter/status, active table ownership, invoice number/financial year, invoice issue date, unique payment request ID, adjustment bill ID/date, and unique sync-operation ID. Add each with the endpoint that uses it. Verify query plans against representative data. Shared phone numbers are supported, so the customer phone index is intentionally non-unique.

## Offline billing — future design

### Recommended first rollout

Use one designated billing device while offline, with individual staff accounts on that device. The safety boundary is the device and its local operation queue, rather than the number of accounts. Two people using one shared account does not prevent duplicate orders or invoices.

Other devices can retain read-only cached screens initially. If the restaurant needs several offline ordering devices, add device ownership and conflict handling before enabling their writes.

### What a power cut changes

Offline software still needs a working device. A battery-powered phone/tablet/laptop can continue while its battery lasts. A desktop, router and printer need battery/UPS support if they are part of the workflow. If the whole local network loses power, a local server cannot serve the other devices. The designated-device design can keep its own data without that network.

Load the installed application, staff permissions and menu before the outage. Save every accepted order/payment operation to IndexedDB before showing it as locally saved. An in-memory tab is insufficient for refresh, browser crashes or device restart. Local storage can still be cleared or lost, so retain a documented paper/manual fallback and a recovery/export procedure for unsynced work.

### During an outage

1. Display Offline and the last successful sync time. Distinguish Saved on this device from Synced.
2. Use the locally saved menu, prices and tax snapshot. The staff member can create orders and record the supported payment methods.
3. Record real cash payments normally. A UPI/card entry needs independent confirmation. A timeout or payment screenshot alone does not prove a provider payment succeeded.
4. Give every order, payment and operation a globally unique identifier. Save a per-device sequence, actor, event time, expected record version and request ID.
5. Print through available local hardware. Decide with the accountant whether to preallocate a valid device-specific invoice series or issue clearly labeled provisional receipts until the server allocates a final number. A provisional receipt must not masquerade as the final tax invoice.
6. Retain the existing order's GST and prices. New catalog/GST updates from the cloud become available once the device reconnects, according to an explicit effective-date rule.

For the first offline version, propose limiting owner approvals, refunds and tax changes to online use. This reduces conflicting financial adjustments. These are rollout choices to confirm with the restaurant, rather than a limitation imposed by offline technology.

### Owner online at another location

The owner sees the last data received by the cloud. New orders and payments created offline cannot appear there until they reach the server. Show that an offline device has pending/unreceived data so reports are not mistaken for a complete live total.

The owner can use other online records. For orders owned by the offline billing device, keep remote editing restricted until sync or an explicit takeover. Ownership must be established before disconnection. A cloud connection does not provide visibility into work that exists only on an offline device.

### Reconnection

An automatic foreground sync should upload the durable queue in order, acknowledge each operation and then download current server changes. Run it on reconnect and app open, with a visible Retry sync action. Background sync is an enhancement, since mobile browsers can suspend the app. Never remove local queue entries until the server acknowledges them.

The server checks permissions, expected versions and unique request IDs. If a request committed but its response was lost, retry returns the existing result. Related payment/order/invoice writes commit together. Google Contacts sync runs after customer records are safely stored on the server.

### Conflicts and recovery

| Situation | Proposed behaviour |
| --- | --- |
| Two offline devices edit one order | Reject conflicting versions for review. Never replace one entire order with the last arriving copy |
| Two devices claim one table | Device ownership and preassigned offline operating areas prevent most conflicts. Escalate unresolved overlaps |
| Payment sent twice after a timeout | Unique payment request ID returns the previous result |
| Owner edits an order remotely while another device is offline | Keep owned orders protected or require a recorded takeover, followed by conflict review |
| Owner disables a staff account during outage | Cached permissions remain limited until revalidation. Use trusted registered devices and a bounded offline authorization period |
| Customer is created on two devices | Normalize phone numbers and flag possible duplicates. Shared family numbers require review rather than automatic merging |
| A dish sells out elsewhere | Show the new availability after reconnection. Keep the actual served/sold history and record the exception |
| Refund and payment both arrive later | Recalculate the outstanding/refundable amount on the server and reject an over-refund |
| Device crashes mid-sync | Restart from the last acknowledged operation. Retain pending entries across restart |
| Browser storage fills | Stop accepting new operations before pretending they were saved. Show recovery/export instructions |
| Device is lost or its site data is erased | Cloud cannot restore unsynced-only work. Use the documented manual recovery procedure |
| Device time is incorrect | Keep local event time and server receipt time separately. Validate financial-day assignment before finalizing reports |
| Only some operations sync | Keep successful operations acknowledged and show the remaining pending/conflicting operations |
| Logout with pending work | Warn, preserve the queue securely, and require authorized recovery. Do not clear pending transactions |

Test outage/restart/reconnect on real devices before activating offline billing.
