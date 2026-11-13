# Sweet Rascal — complete workflow and improvement guide

This guide describes the current local restaurant billing prototype. Open [Sweet Rascal](http://localhost:3000/#overview) and use **Preview as** to try the Owner and Staff views. Guest check-in here means seating or marking arrival for a restaurant visit.

For the latest changes and a hands-on review, see the [UI change report](ui-change-report.md). In Checkout, adjust a dish through **Edit price**, or use **Add discount** for a bill-wide reduction. Resolve any owner approval before recording payment.

## The full service flow

**Choose a table or start a parcel → take the order → save or resume → record service → send to Billing Desk → review the amount → record payment → issue the bill → confirm departure or collection → review daily activity.**

An order has several independent pieces of information. A guest can be served and still owe money, or pay and stay seated.

| What changes | Where staff record it | What it means |
| --- | --- | --- |
| Order preparation | **Save draft**, **Save pre-order**, or **Mark order taken** | A draft can be resumed. A phone pre-order can be saved before arrival. An order taken is active service. |
| Guest details | **Guest & visit → Details status** | Pending, Collected, or Skipped. Walk-ins can be billed without a saved customer. |
| Food service | **Mark food served** or **Mark packed** | Records the current items as served or packed. A later addition can still need service. |
| Billing handoff | **Send to billing desk** | Puts the ticket in **Ready to bill** so another staff member can settle it. |
| Payment | **Checkout** | Advance and checkout payments reduce the balance. A voluntary tip increases the amount to collect. **Issue bill** becomes available when the balance is settled. |
| Departure | **Confirm departure** or **Mark collected** | Records that the guests left or the parcel was collected. A dine-in table is released. A paid bill alone leaves the table occupied. |
| Exception | **Service exceptions** or **Cancel saved order** | Early departure leaves any unpaid amount visible. Cancellation takes a reason and is blocked while payments or an advance are still recorded. |

## Guided example — from check-in to checkout

Use a fictional party of two, Asha and Ravi, and any available table with at least two seats. The amounts below use the seeded menu and demo tax settings. If you have edited prices or settings, use the amounts shown in your browser.

| Time | Person and screen | What to do and what to check |
| --- | --- | --- |
| 12:15 pm | Meera · **Dining tables** | Select an available table and click **Take dine-in order**, or use **Start at table** on its card. Check the table name and set **Covers** to 2 in **Guest & visit**. |
| 12:17 pm | Meera · **Guest & visit** | Search by name or phone for a returning guest. For a new guest, use **Add customer** to link their customer record, or type name and phone on this visit only. Mark the details **Collected** when ready. Add any relevant visit fields such as meal, host or referral. |
| 12:19 pm | Meera · **Dishes** | Add two **Pan-fried fish** at ₹480 each and one **Home-style chicken curry** at ₹340. Open **Note / price** on the curry and enter “Less spicy.” Check that the subtotal is ₹1,300. |
| 12:20 pm | Meera · **Order summary** | Choose **Save draft** if interrupted. Go to **Orders**, filter **Draft**, and resume this ticket. Confirm the dishes, quantities and note survived. Then **Mark order taken**. |
| 12:40 pm | Meera · **Order summary** | Select **Mark food served** once the dishes have reached the party. If an extra dish is requested, add it to the same ticket and mark service again once it arrives. |
| 1:05 pm | Meera · **Order setup** | If Arun will settle the ticket, select him under **Hand off to**, then choose **Send to billing desk**. On the Staff preview, select Arun as the staff member to act as him. |
| 1:07 pm | Arun · **Billing desk** | In **Ready to bill**, open **Review order**. Check the order summary and guest information, then select **Checkout**. On a phone, the Billing Desk opens the order summary first. |
| 1:08 pm | Arun · **Checkout** | Review and show the meal total of **₹1,365.00**. The guest offers a **₹65.00** tip. Enter it in **Voluntary tip** and select **Apply tip**. **Total with tip** is **₹1,430.00**. |
| 1:09 pm | Arun · **Checkout** | Record **₹430 Cash**. Switch to **UPI**, confirm the actual payment was received, then select **Record full balance** for the remaining **₹1,000**. Check that the balance is settled, then select **Issue bill**. |
| 1:10 pm | Arun · **Issued bill** | Check guest, table, item quantities, totals and payment methods. Select **Colour** or **Black & white**, then **Print A4**. To share on WhatsApp, save a PDF from print, review the recipient number, open WhatsApp, attach the PDF and send it manually. |
| 1:17 pm | Arun · **Issued bill** or **Dining tables** | When the party actually leaves, select **Confirm departure**, then **Free table**. Verify the table can be selected for a new order and the original bill still opens. |
| End of day | Owner · **Reports**, **Payments**, **Activity** | Use **Today**. This visit adds ₹1,365 to sales, ₹1,430 to collections and ₹65 to tips on issued bills. Payments show the split. Activity shows the recorded events and their staff names and times. |

The times illustrate the sequence. The app timestamps actions when they are recorded.

| Sample bill calculation | Amount |
| --- | ---: |
| 2 × Pan-fried fish | ₹960.00 |
| 1 × Home-style chicken curry | ₹340.00 |
| Subtotal | ₹1,300.00 |
| CGST at demo rate of 2.5% | ₹32.50 |
| SGST at demo rate of 2.5% | ₹32.50 |
| Meal total | ₹1,365.00 |
| Voluntary tip | ₹65.00 |
| Total to collect | ₹1,430.00 |
| Cash + UPI | ₹430.00 + ₹1,000.00 |
| Amount due | ₹0.00 |

## Other ways an order starts or ends

### Phone pre-order

1. From **New order**, choose **Phone pre-order · assign later**. Enter the guest name, date and appointment time. Add known dishes and an advance with its payment method if money was received.
2. Select **Save pre-order**. Find the ticket under **Upcoming** on Overview or in Orders.
3. On arrival, open the ticket, assign an available table, review covers and select **Mark arrived**. Confirm and finish recording the food before billing.
4. Checkout applies the advance before calculating the remaining amount. Example using the same ₹1,365 meal without a tip: ₹500 advance leaves ₹865 to collect. Keep the advance as its own entry so it is not recorded twice.

### Parcel / takeaway

1. Select **Parcel** on Dining tables or **New parcel** at the Billing Desk. Add dishes, notes, guest information and pickup time as needed.
2. Leave **Reference table** blank or select one for reference. It does not reserve or occupy that table.
3. Save a draft if needed, mark the order taken, and use **Mark packed** when ready. Follow the same payment and issue steps. Select **Mark collected** once the parcel is handed over.

### Changes during service

- **Table move:** Use **Move to table**, then save. The destination must have enough capacity and be available for service. The ticket, dishes and advance travel with the order.
- **Special dish:** Add its name, price, optional preparation note and reason. It belongs to this ticket. Use **Food & pricing** to add repeatable dishes to the catalogue.
- **Price correction:** Use **Note / price** and enter a reason if the price changes. The catalogue price is separate. Any dish already added keeps its captured price until deliberately edited.
- **Sold out:** Mark the dish unavailable in the catalogue. Already recorded quantities stay on tickets. New adds and quantity increases are blocked while it is sold out.
- **Guest leaves early:** Use **Service exceptions** on the order. Confirm the action. A remaining balance stays available for follow-up in Billing Desk and, for the applicable departure date, Reports.
- **Wrong payment before issue:** Use the remove action beside the payment and confirm, then record the correct method or amount. To reduce a tip below the amount already collected, correct the recorded payments first. A recorded payment change is a bookkeeping action in the prototype.
- **Wrong bill after issue:** Owner can void the sample bill with a reason. The bill stays visible as voided. Real refunds and replacement-bill handling need a business workflow.

## Feature inventory by screen

| Screen | What is available |
| --- | --- |
| **Overview** | Start an order, open Dining tables, resume open tickets, find upcoming pre-orders, and open recent bills. Owner also sees sales and average bill figures. |
| **Dining tables** | Area and status filters, table capacity and availability, table-first dine-in start, parcel shortcut, add table, and confirm departure on occupied tables with issued bills. Owner can edit table details. |
| **Orders / Take order** | Search tickets, filter by progress, find stored drafts, review payment status, browse and filter dishes, change quantities, add a special, edit notes and prices, capture visit details and advances, move tables and hand off tickets. |
| **Billing desk** | Ready to bill, Open orders and Issued bills queues. Search by ticket, guest or table. Review orders, open issued bills and confirm departure or parcel collection. |
| **Checkout** | Item review, subtotal, tax breakdown, meal total, advance, optional tip, split Cash / UPI / Card payments, payment removal with confirmation and remaining balance. Recorded payment entries and applied tips carry across reopening checkout. |
| **Bills** | Find and reopen issued or voided bills. The A4 preview has colour and monochrome modes, browser print/PDF, WhatsApp preparation and a departure action when applicable. Reprints use the issued bill snapshot. |
| **Customers** | Name and phone search, customer profile, bill history, named companion contacts and a separate phone-contact note. Owner can view and edit private notes. The contact sync indicator is simulated. |
| **Food & pricing** | Owner can add or edit dishes and categories, change price and description, set food type and mark dishes sold out or available. |
| **Payments** | Owner can inspect advances and recorded checkout payments and filter by method. |
| **Reports** | Owner can choose Today, Last 7 days, This month or custom dates. Includes sales, collections, paid bills, average bill, selectable sales chart, Cash / UPI / Card breakdown, top dishes by quantity or sales, dine-in versus parcel and meal sessions. **Day-end review** covers GST, tips, advances, unpaid departures, voids and order counts. **Records** links to individual bills, voids and balances. |
| **Activity** | Owner can search logged events by ticket, event or staff member. Entries show timestamps in IST. |
| **Staff & access / Settings / My profile** | Owner manages staff and roles, restaurant/bill details and simulated contact sync. Both roles have a profile. |

Sales are based on issued, non-void bills and include demo tax while excluding tips. Collections are based on recorded payment dates and include advances and amounts paid toward tips. This explains why they can differ in a date range. **Paid** is a billing state. **Available** is a table state.

## Improvement review

| Review area | Try this | Decision to make |
| --- | --- | --- |
| Speed | Take a normal dine-in order on a phone, pause it, then let another staff member settle it. | Which fields or taps slow the shift down? Should common actions move closer to the order summary? |
| Seating | Save a draft, attempt an occupied or undersized table, move to a free table, then pay and remain seated. | Is the table status clear at each step? Would a separate “needs cleaning” state help? |
| Food | Add a special, mark a dish sold out, and change a catalogue price while an older order still has that dish. | Who should be able to change a ticket price, and when should approval be required? |
| Exceptions | Try a partial payment, full advance, mistaken payment method, early departure, and an owner void. | What refund, overpayment, write-off or replacement-bill rules does the restaurant use? |
| Reporting | Compare one receipt, split payments, and the same day's report. Open the unpaid departure and void lists. | Which reconciliations or exports are needed at close, and who needs access? |
| Guest and print data | Open the A4 bill in both modes, inspect what prints or gets shared, and review the optional fields with staff. | Confirm the meaning of **Nativity** and **Additional covers**, which guest fields belong on a customer copy, and whether the reverse side is needed. |
| Devices | Repeat the main flow on phone, tablet and desktop. | Where do tapping, scrolling, keyboard entry or the print/PDF steps need work? |

For each improvement, note **screen → step → expected result → actual result → device and role → priority**. Example: “Billing Desk → search by order number → show matching ticket immediately → result only appears after changing the queue → phone, Staff → high.”

The prototype stores changes in the current browser. Role switching demonstrates permissions, and payments and Google Contacts use demo records. A production rollout needs shared data, real sign-in and permission checks, agreed accounting rules, and a plan for refunds and failed or duplicate transactions across devices.
