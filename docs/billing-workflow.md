# Sweet Rascal billing workflow

## Service screens

| Screen | Placement and actions |
| --- | --- |
| Dining tables | Put the table picker, Take dine-in order, Parcel and Add table above the floor cards. Name, area and capacity are required. Each card shows availability and the action appropriate for its ticket. |
| Take order | Put dish search and categories first, with ordered dishes beside them on wide screens. On phones, expose item count, total and the order summary below the menu. Use Special dish for one-off requests. Quantity, preparation note, price and served quantity belong with each line. Keep table assignment, staff handoff and guest details in the same ticket. |
| Orders | Show drafts, active service, pickup orders and completed bills. On a phone, group the guest, status, balance and action into a compact ticket. Preserve saved tickets when staff switch roles, tasks or refresh. |
| Billing desk | Put ready tickets first. Staff can also find open tickets and issued bills. Review the total with the guest, apply any voluntary tip, record payment, and issue the paid bill. |
| Departure | After issue, confirm departure from the bill, table card, or Billing Desk when the guests leave. Until then the table remains occupied. Use Service exceptions for a departure before billing. |
| Food & pricing | Owner manages dishes, categories, menu prices, and availability. Ticket-specific prices are edited on the order and require a reason. |
| A4 bill | Match the layout of the supplied red front page. Provide colour and monochrome, with a wordmark based on the sign's overlapping hearts. Leave space for the paper fields. Save as PDF through print and attach the PDF to the prepared WhatsApp message. |
| Customers | Keep private notes separate from the optional phone-contact note. Capture each additional contact's name and number. Google Contacts is simulated in this prototype. |
| Owner | Reports show the selected day's sales and collections, outstanding balances after departure, and voided bills. Activity shows actor, event time in IST, order number and correction details. |

## Rules

- Start a seated dine-in ticket from its table. A phone pre-order can wait for a table. Require one for a dine-in bill. A parcel never needs a table and can have a pickup time.
- Owner and Staff share operational tickets. Staff accounts can hand off a ticket. Owner also sees reports, activity, and configuration and can void issued bills.
- Keep the captured unit price when menu pricing changes. An intentional override requires a reason. A sold-out dish stays on tickets where it was already added.
- Track food progress separately from payment and departure. Leaving or pickup releases the table without clearing an unpaid balance. Keep the original bill snapshot for reprints.
- Show voluntary tips as a separate amount after the meal total. Recorded payments cover the meal total and any applied tip. Show tips on issued bills separately from sales in the Owner summary.
- Record order capture, service, table changes, handoffs, payment changes, billing, voids, departure and WhatsApp opening. Opening WhatsApp does not confirm delivery.
- The photographed covers suffix and Nativity field have no confirmed business meaning. Keep them editable and optional. A reverse-side design needs its source image.

## Acceptance checks

Run table-first dine-in, phone pre-order and table-free parcel. Save and resume a draft, create a new table, reject an occupied or undersized table, change a price with a reason, and hand off the ticket. Test sold-out dishes, later additions after food is served, split payment, backing out of checkout, duplicate issue attempts and unpaid departure. Verify Owner-only reporting and review the order, checkout and A4 bill at phone, tablet and desktop widths. Print colour and black-and-white proofs with backgrounds disabled and test a long bill.
