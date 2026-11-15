# Lucky Games & Grill — Lounge Billing & Management

Gaming lounge ka counter software: PS5 / PC / Pool / VR seats ka timer, auto billing, snacks & grill, invoices, customers, bookings, memberships, tournaments, reports — **Node.js (Express) + React (Vite) + MongoDB Atlas**.

---

## 1. Chalane ka tareeka (local)

Is Mac pe default Node v14 hai — app ko **Node 20** chahiye (`.nvmrc` me set hai).

```bash
cd "/Users/macbook/Desktop/Test code/LuckyGamenGrill"
nvm use                # Node 20
npm run setup          # pehli baar: root + server + client packages
npm run seed           # pehli baar: logins, rate card, stations, menu, plans
npm run dev            # API :5050 + React :5173 (live reload)
```

Browser me kholo: **http://localhost:5173**

### Login (starting accounts)

| Role | Login ID | Password |
| --- | --- | --- |
| Owner / Admin | `admin` | `server/.env` → `SEED_ADMIN_PASSWORD` |
| Staff (counter) | `staff` | `server/.env` → `SEED_STAFF_PASSWORD` |

Pehli login ke baad sidebar me 🔑 se password badal lena. Password bhool gaye to:

```bash
npm run seed -- --reset-passwords
```

(ye dono accounts ka password wapas `.env` wale pe kar deta hai)

---

## 2. Shop me use karna (production — ek hi server)

```bash
nvm use
npm run build          # React ko client/dist me bana deta hai
npm start              # http://localhost:5050 — API + app dono
```

- Counter PC pe chalao, baaki devices (mobile, tablet, doosra PC) same Wi-Fi pe `http://<counter-PC-ka-IP>:5050` kholen. Sab screens live sync rehti hain.
- Hamesha chalu rakhne ke liye: `npx pm2 start "npm start" --name lucky` (PC restart pe bhi).
- VPS/cloud pe daalo to us server ka IP **MongoDB Atlas → Network Access** me add karna padega.

---

## 3. Modules

**Counter (Staff + Owner)**
- **Dashboard**: har seat ka live timer + running bill, Start / Pause / Resume / Done, players (1P–4P alag rate), snacks per seat, customer per seat, **Edit timer**, **Stop timer** (prepaid — khud band + beep), **Transfer**, **Reset / Reset All**, filters (game type / free / playing / billing), low-stock alert.
- **Billing**: kai seats ka ek bill, ₹ ya % discount, customer autosuggest (phone/name), loyalty points redeem, GST (on ho to).
- **Payment**: Cash, Online/UPI (**scan-to-pay QR** with exact amount), Split (cash + online), Pay later (credit), Wallet.
- **Receipt**: 80 mm thermal print, WhatsApp bhejna, Continue (galti se Done).
- **Snacks Sale**: bina seat ke walk-in bill, stock auto-minus.
- **Invoices**: search, reprint, pending collect, cancel (owner), Excel export.
- **Customers**: visits, spend, wallet, points, udhaar, history, recharge.
- **Bookings**: day view, double-booking block, Arrived / No-show / Completed, WhatsApp confirm.
- **Help & Guide**: login ke baad, role ke hisaab se (Staff guide / Owner guide), search + FAQ.

**Owner / Admin**
- **Memberships & Rewards**: wallet plans (pay ₹1000 → ₹1200), validity, loyalty points rules.
- **Tournaments**: players, check-in, entry fee (→ income), results & prizes (→ expense).
- **Expenses & Income**: rent, salary, stock, repair income…
- **Reports**: Daily Revenue (cash / online / pending / net), Monthly (graph + GST summary), System Usage (game-wise kamai, peak hour), Snacks & Stock, Activity Timeline (kisne kya kiya).
- **Shop Setup**: Rate Card (block minutes + per-player rate, grace period, bonus time), Stations, Snacks & Grill Menu (stock / restock / write-off), Live View QR per seat + device webhooks, Manage Staff (permissions), Shop Details (UPI, GST, bill footer).
- **Customer Live View**: seat ka QR scan karke customer apne phone pe time + bill dekhe (bina login).

### Staff permissions
Owner har staff ke liye tick kar sakta hai: Billing, Snacks Sale, Transfer, Edit timer, Reset, Discount, Customers, Bookings, Memberships, Tournaments, Expenses, Reports, Shop setup. Default staff ko revenue/reports **nahi** dikhte. Har Start / Reset / Edit timer / Discount / Bill Activity Timeline me log hota hai.

---

## 4. Folder structure

```
LuckyGamenGrill/
├── server/            Express API (ESM)
│   ├── .env           ← secrets (git me mat daalna)
│   └── src/
│       ├── index.js   app, security headers, gzip, static React build
│       ├── models.js  MongoDB schemas
│       ├── auth.js    JWT login, roles, permissions
│       ├── events.js  live sync (Server-Sent Events)
│       ├── seed.js    first-run data
│       └── routes/    stations, billing, setup, customers, reports, misc
├── client/            React (Vite)
│   ├── public/        logo (cropped from the WhatsApp image), icons
│   └── src/
│       ├── pages/     Dashboard, Help, Invoices, Customers, Bookings, Reports, Setup…
│       └── components/ StationCard, Billing (checkout, receipt, snacks sale)
└── shared/pricing.js  billing math — server aur screen dono same formula use karte hain
```

## 5. Speed / optimisation
- Har page alag chunk (lazy load) — pehli load ~70 KB gzip; baaki pages zarurat pe.
- Timer har second sirf time wala chhota hissa re-render karta hai, poora card nahi.
- Live updates SSE se (polling nahi), gzip, hashed assets 1 saal cache, Mongo indexes, `lean()` queries.
- Koi heavy UI/chart library nahi — charts hand-made CSS.

## 6. Security notes
- MongoDB password `server/.env` me hai. **Ye password screenshot me share hua tha — Atlas → Database Access me rotate karke `.env` update kar lena.**
- Atlas Network Access me abhi sirf current IP allowed hai; internet IP badle to wahan naya IP add karna.
- Login brute-force limit (8 try / 10 min), passwords bcrypt, JWT 12 ghante, strict CSP.

## 7. Jo shamil nahi hai
- PC Lock / TV Lock ke liye alag Windows / Android-TV app nahi banaya. Har seat pe **Device ON/OFF webhook** hai (Start/Done pe call hota hai) — Tuya / Home Assistant / IFTTT ya apna lock-script isse jod sakte ho.
- Online public booking page (customer khud book kare) abhi nahi; bookings staff add karta hai.
