# TAPJERR.io — Cloud POS & QR Ordering for Selagi Coffee

> **Smart Ordering. Seamless Business.**

TAPJERR.io is an all-in-one cafe platform: POS cashier, table QR ordering, takeaway/tapau, kitchen display, menu, inventory, customers, reports, staff roles and settings. Everything runs on the same real-time database.

Built with **HTML5, vanilla CSS and vanilla JavaScript (ES modules)**, plus **Firebase Auth, Firestore and Storage**. It uses no framework and needs no build step.

## Interfaces

| URL | Who | What |
| --- | --- | --- |
| `/` | Everyone | Landing page with links to ordering, the dashboard and the kitchen screen |
| `/admin.html` | Staff | Admin and staff dashboard, protected by login and roles |
| `/kitchen.html` | Kitchen | Full-screen Kitchen Display for tablets (keeps the screen awake) |
| `/order/table/01` | Customers | Dine-in ordering. The table number is detected from the URL |
| `/order/takeaway` | Customers | Takeaway ordering with pickup date and time. No account needed |

`order.html?table=01` and `order.html?mode=takeaway` also work on any static host.

## Quick start (Demo Mode)

```bash
node serve.js          # http://localhost:8080 — no dependencies required
```

If `js/core/config.js` has no Firebase config, the app runs in **Demo Mode**. Data is stored in the browser and syncs live across tabs on the same device. For example, you can place an order in one tab and watch it appear on the dashboard and kitchen screen in another tab.

Demo staff accounts (shown on the login screen):

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | owner@selagi.coffee | owner123 |
| Admin | admin@selagi.coffee | admin123 |
| Cashier | cashier@selagi.coffee | cashier123 |
| Kitchen Staff | kitchen@selagi.coffee | kitchen123 |

The system starts with the real Selagi Coffee menu, 8 tables and default settings. It shows **no fake sales**. To preview the charts, a Super Admin can choose **Settings → Data → Generate demo data**. Every order created this way is tagged `demo: true`, shows a "Demo data" badge and can be removed in one click.

## Going live (Cloud Mode with Firebase)

1. Create a Firebase project. Enable **Authentication → Email/Password**, **Cloud Firestore** and **Storage**.
2. Paste your web app config into `js/core/config.js`. This config is a public identifier, not a secret. **Never** put service-account or Admin SDK keys in frontend code.
3. In `firestore.rules`, replace `owner@selagi.coffee` with the owner's real email address.
4. Create that owner user in Firebase Auth, then deploy:
   ```bash
   npm i -g firebase-tools && firebase login
   firebase use --add <project-id>
   firebase deploy        # hosting + firestore.rules + storage.rules
   ```
5. Sign in to `/admin.html` as the owner. The Super Admin profile is created automatically, along with the starter menu, tables and settings. Then add staff under **Staff**.
6. Under **Settings → Ordering & QR**, set the **QR base URL** to your domain (for example `https://tapjerr.io`). Then print the QR codes from **QR Ordering**.

Vercel works too: `vercel.json` includes the `/order/*` rewrite.

## Feature map

- **Overview**: sales, orders, items, average order value, pending, completed and cancelled counts, a daily target ring and monthly revenue. Charts cover sales over time, payment methods, order types, weekly/monthly/yearly sales and top sellers. The date filter offers Today, Yesterday, This Week, This Month and Custom. The right-hand panel shows notifications and the Insights Assistant.
- **POS**: categories, search, product photos, variations and add-ons, item notes, quantity controls, discounts (presets or custom), service charge, tax and 5-sen cash rounding. Payment methods are Cash (with change), DuitNow QR, Online Transfer, plus any custom methods. Each sale produces a digital and printable receipt. You can also send an order to the kitchen and take payment later.
- **Tables**: grid view and a drag-and-drop floor plan. Each table shows Available, Occupied or Reserved, its guest count, current orders and running bill. Staff can settle a whole table at once, close it, or see its QR code.
- **QR Ordering**: a unique URL and QR code for every table, a takeaway QR, a print sheet (A4), SVG download, channel on/off switches and a live feed of customer orders.
- **Takeaway**: a board with the columns New → Confirmed → Preparing → Ready → Completed, plus walk-in order entry (name, phone, pickup date/time, items, instructions, payment). Order numbers are generated automatically (`TAP-YYYYMMDD-NNN`). Each card shows the estimated or overdue pickup time and a WhatsApp "ready" button.
- **Orders**: tabs for All, Dine-in, Table QR, Takeaway, Pending, Preparing, Ready, Completed, Cancelled and Verify Payment. You can search, filter by date, export CSV, and open an order to see its timeline, change its status, take payment, refund it or print a receipt.
- **Kitchen Display**: large colour-coded cards with a timer and late-order alerts, a sound for new orders, filters for Dine-in and Takeaway, and the flow New → Preparing → Ready.
- **Products & Menu**: create, edit, duplicate and delete products. You can upload photos, manage categories, enable/disable items, mark them sold out or featured/popular, and set up option groups (variations and add-ons) and recipes.
- **Inventory**: stock in and out, current balances, low-stock alerts, movement history, suppliers, and optional automatic deduction from recipes when an order is completed.
- **Customers**: built from order history by phone number. Shows total orders, total spent, last order, favourite items and notes.
- **Reports**: daily, weekly, monthly, yearly or custom ranges, covering product performance and breakdowns by payment, order type, status and cashier. Exports to CSV and PDF (a print-ready report you can save as PDF).
- **Staff**: Super Admin, Admin, Cashier and Kitchen roles with a permission matrix. Staff accounts can be deactivated, and passwords reset.
- **Settings**: profile and logo, opening hours with an Open/Closed override, ordering channels, payment methods (DuitNow QR image, bank details), tax, service charge, rounding, discount presets, receipt text, notifications, demo data and backup.
- **Customer app**: Home, Menu, My Cart, My Orders and Help. It has an animated order tracker (Received → Confirmed → Preparing → Ready → Completed) and lookup by order number. No registration is needed.

## Security model

- Firestore rules (`firestore.rules`) enforce roles on the server. Hiding things in the UI is not relied on for security.
- Customers can read the menu without an account. They can only **create** orders, and those orders must have status `new` and payment `unpaid` or `pending_verification`. **Customers cannot mark an order as paid.** Online transfer and DuitNow orders stay as **Verifying** until staff confirm the money arrived.
- Customers track orders through `orderStatus/{orderNo}`, a public mirror that contains no names or phone numbers. The full order documents, which include personal data, are readable by staff only.
- Order numbers come from per-day counters, and the rules only allow a counter to go up by one.
- Kitchen staff can only change an order's status (New, Preparing or Ready). Stock movements are an immutable audit log.
- Recommended for production: add a Cloud Function that re-prices customer orders on the server. The rules check the order's shape and limits, but they cannot check prices against the menu.

## Project structure

```
index.html  admin.html  order.html  kitchen.html  manifest.webmanifest  sw.js
css/      base.css (design system) · admin.css · customer.css
js/core/  config · store (facade) · store-local (Demo) · store-firebase (Cloud) · orders (business logic)
          permissions · charts (SVG) · qr · receipt · seed (Selagi menu) · ui · utils · icons (Lucide subset)
js/admin/ app (shell, router, live data hub) · common · analytics · assistant · demo · kitchen-standalone
          pages/ overview pos tables qr takeaway orders kitchen products inventory customers reports staff settings
js/customer/app.js
js/vendor/qrcode.mjs   (qrcode-generator, MIT)
firestore.rules  storage.rules  firebase.json  vercel.json  serve.js
```

## Notes

- **Insights Assistant**: the "Ask anything about your business" panel computes its answers from your live store data inside the browser, so no third-party AI API keys are exposed. It can suggest revenue ideas, list products that aren't selling, draft a weekend promotion (and save it as a discount preset in one click), summarise today's business, and report low stock and pending orders.
- **PWA**: the app can be installed. A service worker caches the app shell for offline loading. Firebase data is always fetched live.
