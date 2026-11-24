# Server-side history and reporting — implementation report

## What changed

The connected workspace opens active orders, drafts, pre-orders and occupied tables, plus eight recent invoices. It no longer downloads the restaurant's entire closed-order, bill or refund history at startup.

Bills, Reports, Payments and Activity request records from MongoDB when needed. Each page returns at most 20 rows. Opening a bill separately loads its full printable snapshot, its live departure record and its linked refunds. No issued invoice is rewritten by these read operations.

| Screen | Behavior |
| --- | --- |
| Overview | Server-calculated daily issued sales, refunded sales, net sales, tips, average bill, dining guests, top dishes and 7/14-day sales trend |
| Bills | Date range, customer/bill search, service, payment method, bill status and server sort; next/previous pages |
| Reports — Sales | Original issued sales including GST, with tips separate; voided invoices excluded |
| Reports — Refunds | Refunds selected by their own date, including refunds against older bills |
| Reports — Activity | Server-filtered service events, staff names, times and correction details |
| Payments | Recorded payments and advances by payment date and method, with original order/bill references |
| Customer detail | Opens server-filtered bills for that exact saved customer ID, rather than counting only the workspace's recent bills |
| Billing desk | Active billing work remains available; the issued-bills view links to complete searchable bill history |

The demo continues using its sample records. The server-backed screens are used when MongoDB is configured and the user is signed in.

## Filters, totals and downloads

- A report defaults to the current month. Choose up to 366 days in one request; query other date ranges separately to reach older records.
- Owner accounts can search older records. Staff bill history is limited to today's bills; an older bill for a table that is still occupied can still be opened through the active service workflow. Server endpoints enforce these rules.
- Dates follow Asia/Kolkata. Refund and activity timestamps near midnight are matched to the correct restaurant day.
- Search waits 250 ms after typing and cancels superseded requests. Loading/error states hide stale results and their actions.
- Filters, report tab, sorting and pagination are stored in the URL. Opening a bill keeps those values. Closing it returns to the same filtered page; refreshing the open bill also works.
- Totals describe **all matching rows**, rather than only the 20 visible rows.
- A bill/sales payment-method filter includes a bill when that method was used. Its sales amount is the full bill amount. Payments history shows the individual payment amounts instead.
- Sales totals include GST, keep tips separate and exclude voided bills. Refunds remain linked adjustments; the original invoice is unchanged. Overview subtracts sales refunds recorded today, including refunds against older invoices.
- Legacy voided rows retain their original bill total for reference, with zero sales/GST/tip contribution in history and CSV. This keeps exported sales columns consistent with the screen summary.
- CSV uses the same server filters and sort as the screen, downloads all matching pages, streams records in batches, and escapes spreadsheet formulas. A failed download shows a retry action.
- No cash reconciliation, bank-account tracking, offline billing or payment-gateway integration was added.

## Database behavior

History uses cursor-based next/previous pages, with a unique row ID as the tie-breaker. A cursor from a different filter/search/sort is rejected. Counts and totals are calculated separately from the cursor so they cover the complete filtered set.

Date filters run before financial aggregation. Declared indexes support invoice dates, exact customer/date searches, refund dates and bill references, order state, event times, payment dates and advance dates. Required read indexes are added idempotently when the connected workspace opens; existing indexes are not dropped.

MongoDB financial expressions use half-up rounding for nonnegative paise, matching the current billing calculation. They deliberately avoid MongoDB's [documented rounding-to-even behavior](https://www.mongodb.com/docs/manual/reference/operator/aggregation/round/). Percentage discounts, stale/pending discounts, saved tax rates and tips are handled consistently with checkout.

## Verification completed

- Production build, TypeScript check and whitespace checks passed.
- An isolated MongoDB test with 120 historical invoices verified bounded workspace loading, totals against the shared billing calculation, discounts, half-up tax rounding, next/previous pages, all sort options, filter-bound cursors and invalid dates/ranges.
- Tests covered exact customer references, split-payment method filtering, advances, legacy voided rows, refund statuses, cross-day refunds, IST date boundaries, staff restrictions and direct historical invoice access.
- CSV checks covered all filtered pages, matching sales figures, streamed downloads and spreadsheet-formula escaping. The invoice date query used an index.
- Browser checks covered the five server-backed screens at 320, 390, 820 and 1440 CSS pixels, URL filter/page preservation after opening and refreshing a bill, CSV download, failed-request recovery, empty searches and a delayed order-detail response after navigating away.
- The existing billing suite also passed: order/draft saves, competing table claims, price changes, GST snapshots, owner-approved discounts, split payments, tips, duplicate issuance, immutable invoices, refunds, departures and 52 responsive route checks.
- Mobile and desktop screenshots were visually reviewed. Automated tests used temporary databases and did not write to the configured restaurant database.

## Manual checks

1. Open Bills. Search a guest or bill, change dates, choose a status and sort by amount. Go to page two, open a bill, refresh, then return. Confirm the filters, sort and page remain.
2. In Reports, select a date range and note the total count/sales/GST/tips. Download CSV and confirm it includes all matching pages, not just the visible rows.
3. Filter sales by Cash or UPI for a split-payment bill. Confirm the report shows the whole bill and the Payments page shows the individual entries.
4. Refund an older bill today. Confirm it appears in today's Refunds and reduces today's Overview net sales, while its original invoice stays unchanged.
5. Compare Overview issued sales with today's unfiltered Sales report. Compare refunded sales with today's Refunds sales-returned total. Tips must remain separate.
6. Open a customer's profile and select Search customer bills. Confirm another customer with the same name is not included merely because the names match. Reset Filters to return to all bills.
7. Open historical bills not present in the workspace's recent eight. Verify A4 preview, download, sharing and owner refund actions still work.
8. Sign in as Staff. Check today's bill search/reprints and active-table departure. Attempt an owner report URL and an older completed invoice; access must be denied.
9. Briefly interrupt a history request or simulate a server failure. Check the retry action, absence of stale clickable rows, and recovery. Try a search with no results and an invalid date range.
10. Check Overview, Bills, Reports, Payments and Activity on phone, tablet and desktop. Open mobile Filters, use pagination and download a report. Bottom navigation stays limited to compact layouts.
11. Repeat an ordinary service flow: draft, dishes, price correction, split payment/tip, issue bill and confirm departure. Refresh the workspace and verify the saved records.

## Remaining release work

Validate on the restaurant's Atlas-backed staging deployment and actual phones/printers. Automatic multi-device updates, account/password recovery, backup/restore verification, monitoring and a restaurant pilot remain later phases. Offline billing remains deferred.

Reports and exports read the current saved database state. If staff change a record between viewing and downloading, refresh the report before comparing. Downloads are not a frozen accounting-period snapshot. Very large ranges are bounded to 366 days and queries have time limits; production load testing with the restaurant's expected volume is still required.
