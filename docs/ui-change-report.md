# Sweet Rascal — changes and review checklist

Open [the local app](http://localhost:3000/#overview) to try the changes. Use the **Preview as** control to test Owner and Staff. This is a frontend prototype: edits are saved in the current browser and are not shared between devices. Owner approval is a preview workflow, not a production security control.

## What changed

| Area | Change |
| --- | --- |
| Navigation | Phones and compact tablet views (up to 930 CSS pixels wide) get **Tables · Orders · Billing · Bills · More** in a bottom bar. **More** opens a bottom sheet with labeled Lucide icons and only shows destinations for the selected role. The heart in the header returns to Overview. Desktop and wide tablet views use the full sidebar. |
| Dashboard and lists | More compact overview, 7-day and 14-day sales views, more readable lists on phones, and grouped settings. |
| Restaurant wording | Guests, Assign to waiter, Walk-in / Phone / Online, Waiting for bill, and Guest left without paying. The optional paper-bill fields are labeled in plain language in the editor; the printed template still uses the original wording. Online is a manually recorded source. |
| Editing prices at Billing | Every dish has an **Edit price** action in Checkout. A price change applies to all units on that order line. It requires a reason and leaves the Food & Pricing catalog untouched. The owner’s Activity view records the previous and new unit price and the reason. |
| Discounts | Percentage or fixed amount with a required reason. They reduce the dish subtotal before tax in the prototype; tips and advances stay separate. The default Staff threshold is **10%**, configurable by the owner in Settings. A request above the limit pauses payment and bill issuance until the owner approves or the request is withdrawn. |
| Bills and reports | A4 invoice shows the applied discount and recalculated totals. Reports use discounted bill totals; the Top Dishes view shows item sales before bill-level discounts. Color and black-and-white invoice previews remain available. |
| Install and offline | **More → Install app** has an install prompt when supported and browser instructions otherwise. Losing connection pauses workspace actions; reopening offline shows a reconnect screen. The service worker caches only that screen. |

## What to check

1. **Navigation on your phone and tablet.** Tap each of the five bottom buttons. Open **More**, check that it comes up from the bottom, and try closing it with the close button and by tapping outside it. Check the icon labels and that the bottom bar does not cover checkout controls. Switch to Staff and verify that Owner-only destinations such as Reports and Settings disappear.
2. **Run a dine-in bill.** In **Tables**, select an available table, take an order, assign a waiter, enter the guest count, mark food served, and send the order to **Billing**. In **Waiting for bill**, open the order and tap **Checkout**. Confirm the dish names, units, per-unit prices, line totals, taxes, and balance are easy to find.
3. **Edit a price.** Open **Edit price** next to a dish. Try a valid decimal price, an invalid negative value, a missing reason, and ₹0 with a reason for a complimentary dish. Verify the total updates and the catalog price stays the same. Make a partial mock payment and check that a price reduction which would overpay the bill is blocked. Once a bill is issued, staff should no longer edit its dish prices.
4. **Try both discount types.** As Staff, test a 5% discount, a fixed amount, and a 15% request with a reason. With the default limit, check that 15% blocks payment. Switch to Owner, reopen the order in Billing, and choose **Review discount → Approve discount**. A subtotal change requires the discount to be reviewed again. Verify the reason and activity record, and check the printed discount amount.
5. **Check settlement and departure.** Record payment, issue the bill, then confirm departure only after the guests leave. Verify the table becomes available. Repeat with a parcel: the table is optional and the final action is **Mark collected**. Compare color and black-and-white A4 output, including a bill with many dishes.
6. **Check the install experience on a real device.** Open the app from a reachable secure URL and use **More → Install app**. Open the installed app, lose connection during checkout, and reconnect. Confirm the current screen resumes and that no payment can be recorded while offline.

**Printing:** From **Bills**, open a bill, choose **Colour** or **Black & white**, and tap **Print A4**. Check the device's print dialog for **A4 · Portrait** and choose a printer or **Save as PDF**. The phone preview can reflow; the printed document does not use that layout. Long bills use more A4 pages, with the bill reference and dish headings repeated.

**Offline:** There is no time limit on the reconnect screen, but there is no offline working period. Orders and payments pause as soon as the app detects the loss of connection. Keep the current tab open to retain unsaved edits in memory. If the tab closes, reloads, or is discarded, those unsaved edits may be lost. Previously saved prototype records stay in the same browser if its site data is retained. Opening or reloading offline shows the cached reconnect screen. The app does not queue or sync changes made offline.

## Food & Pricing: what to add next

The current page covers daily work: add or edit dishes, organize categories, set catalog prices, and mark dishes sold out. Keep that as the main screen. If staff repeatedly need more, prioritize **duplicate a dish** for fast entry and **archive a seasonal dish** so it stays out of the live menu while old bills keep their original details. Add portion sizes, item add-ons, or allergen fields only if Sweet Rascal has a regular use for them. Use **Billing → Edit price** for one customer’s bill and **Food & Pricing** for a lasting catalog change.
