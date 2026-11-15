import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Gamepad2, ReceiptText, Popcorn, Users, CalendarClock, QrCode, Tags, Monitor, UtensilsCrossed, UserCog, Store, Crown, Trophy, LineChart, Plug, ListChecks, HelpCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../state.jsx';
import { PageHead, SearchBox } from '../ui.jsx';

const K = ({ children }) => <span className="kbd">{children}</span>;
/** Plain text of a JSX tree — used by the help search. */
const textOf = (n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join(' ') : n?.props ? textOf(n.props.children) : '');

/* who: 'all' | 'admin' | a permission key */
const SECTIONS = [
  {
    id: 'start', who: 'all', icon: Rocket, title: 'Shuruaat (Getting started)',
    body: (role) => <>
      <p>Login ke baad left side me menu dikhta hai (mobile pe upar <b>☰</b> dabao). {role === 'admin' ? 'Aap Owner/Admin ho — aapko saare modules dikhenge.' : 'Aap Staff ho — owner ne jo permission di hai, wahi menu dikhega.'}</p>
      <ul>
        <li><b>Dashboard</b> = counter screen. Yahin se saare seats chalte hain aur bill banta hai.</li>
        <li>Neeche apne naam ke paas <b>☀/🌙</b> se dark/light theme, <b>🔑</b> se apna password badlo, <b>Logout</b> se bahar niklo.</li>
        <li>Ek se zyada device (counter PC, mobile, tablet) pe ek saath login kar sakte ho — sab screens <b>live sync</b> rehti hain.</li>
      </ul>
    </>,
  },
  {
    id: 'session', who: 'all', icon: Gamepad2, title: 'Session: Start se Bill tak',
    body: () => <>
      <ol className="steps">
        <li>Free seat pe <b>Start</b> dabao. Timer chalu, card green ho jayega. Pehla billing block (jaise 30 min) turant charge hota hai.</li>
        <li><b>Players · snacks · customer</b> kholo: kitne log khel rahe hain (1P/2P… har ka alag rate), snacks/grill items <b>+ / −</b> se add karo, customer ka naam/phone (optional) likho.</li>
        <li>Break ho to <b>Pause</b>, wapas aaye to <b>Resume</b>. Pause ke time Done nahi hota — pehle Resume karo.</li>
        <li>Khel khatam → <b>Done</b>. Seat turant free ho jaati hai aur bill card right side <b>Billing</b> me aa jata hai.</li>
        <li>Billing me seat tick karo (kai seats ek bill me jod sakte ho), discount/customer daalo, <b>Generate Invoice</b> → payment mode chuno → <b>Mark as Paid</b>.</li>
        <li>Bill <b>Print</b> karo ya <b>WhatsApp</b> pe bhejo. Ho gaya! ✅</li>
      </ol>
      <p className="mt12"><b>⋮ (More)</b> menu: <b>Edit timer</b> (galat time theek karna), <b>Stop timer</b> (prepaid: 30/60/90 min baad khud band + beep), <b>Transfer</b> (session doosri seat pe, time nahi jaata), <b>Reset</b> (bina bill clear — log hota hai).</p>
    </>,
  },
  {
    id: 'billing', who: 'billing', icon: ReceiptText, title: 'Billing & payment modes',
    body: () => <>
      <ul>
        <li><b>Cash</b> — poora paisa cash me.</li>
        <li><b>Online / UPI</b> — Shop Details me UPI ID daala ho to checkout pe <b>QR code</b> aata hai; customer scan karke exact amount pay karta hai.</li>
        <li><b>Split</b> — thoda cash, baaki online. Cash likho, online khud bhar jata hai. Dono ka total bill ke barabar hona chahiye.</li>
        <li><b>Pay later (Credit)</b> — customer ka phone zaroori. Bill <b>Pending</b> me jata hai; baad me <Link to="/invoices">Invoices</Link> ya Daily Revenue se <b>Collect</b> karo.</li>
        <li><b>Wallet</b> — membership wale customer ka prepaid balance se kat jata hai.</li>
      </ul>
      <p><b>Discount:</b> ₹ mode me <K>-50</K> = ₹50 kam, <K>+30</K> = ₹30 extra. % mode me <K>10</K> = 10% off. (Discount sirf unko dikhega jinke paas permission hai.)</p>
      <p><b>Loyalty points:</b> purane customer ka phone daalte hi uske points dikhenge — “Redeem” tick karo to points ke paise bill se kam ho jayenge.</p>
      <p><b>Galti se Done dab gaya?</b> Billing card pe <b>↩ Continue</b> — session wapas seat pe chalne lagega.</p>
    </>,
  },
  {
    id: 'snacks', who: 'snacksSale', icon: Popcorn, title: 'Snacks Sale (bina seat ke)',
    body: () => <p>Koi sirf burger/cold drink le raha hai? Dashboard pe <b>Snacks Sale</b> → items + / − → (optional) customer → payment mode → <b>Generate Bill</b>. Bill turant paid ho jata hai aur stock apne aap kam ho jata hai.</p>,
  },
  {
    id: 'customers', who: 'customers', icon: Users, title: 'Customers',
    body: () => <p>Phone number ke saath bill banate hi customer apne aap save ho jata hai. <Link to="/customers">Customers</Link> me search karo — visits, total kharcha, wallet, points, udhaar (due) aur poori playing history dikhegi. Billing me phone ke 2 digit likhte hi suggestion aata hai.</p>,
  },
  {
    id: 'bookings', who: 'bookings', icon: CalendarClock, title: 'Bookings',
    body: () => <p><Link to="/bookings">Bookings</Link> → <b>New booking</b>: naam, phone, date, time, duration, game. Station chunoge to usi time pe double-booking block ho jayegi. Customer aaye to <b>Arrived</b>, na aaye to <b>No-show</b>. 💬 button se WhatsApp confirmation bhejo.</p>,
  },
  {
    id: 'live', who: 'all', icon: QrCode, title: 'Customer Live View (QR)',
    body: () => <p>Har seat pe ek QR sticker lagao (Owner: Shop Setup → Live View &amp; Devices → QR → Print). Customer scan karke apne phone pe <b>chalta time aur current bill</b> dekh sakta hai — koi app/login nahi chahiye.</p>,
  },
  {
    id: 'rates', who: 'setup', icon: Tags, title: 'Rate Card & time rules',
    body: () => <>
      <p><Link to="/setup/rates">Rate Card</Link> me har game type (PS5, PC, Pool, VR…) ka <b>billing block</b> (jaise 30 min) aur <b>players ke hisaab se rate</b> set karo. Time hamesha agle block tak <b>round up</b> hota hai.</p>
      <p><b>Example:</b> PS5 2-player ₹70 / 30 min, khele 1h 10m → 3 blocks × ₹70 = <b>₹210</b>.</p>
      <p><b>Grace period</b> (Admin): itne minute extra free — jaise grace 5 pe 35 min = 1 hi block. <b>Bonus time</b>: jaise 2 ghante khelne pe 15 min free.</p>
    </>,
  },
  {
    id: 'stations', who: 'setup', icon: Monitor, title: 'Stations, menu & stock',
    body: () => <ul>
      <li><Link to="/setup/stations">Stations</Link>: naye PS5/PC add karo (ek saath 5 bhi — naam khud number ho jayenge), naam/type/order badlo, band karo.</li>
      <li><Link to="/setup/menu">Snacks &amp; Grill Menu</Link>: item, price, category. <b>Stock</b> button se naya maal (+24) ya kharab maal (−2) likho. Har bill pe stock khud kam hota hai; kam hone pe dashboard pe “low stock” dikhega.</li>
    </ul>,
  },
  {
    id: 'staff', who: 'admin', icon: UserCog, title: 'Staff & permissions (Owner)',
    body: () => <>
      <p><Link to="/setup/staff">Manage Staff</Link> → <b>Add staff</b>: naam, login ID, password. Phir tick karo wo kya kar sakta hai:</p>
      <ul>
        <li>Default staff: Billing, Snacks Sale, Transfer, Customers, Bookings, Discount.</li>
        <li><b>Reports</b> diya to hi revenue dikhega. <b>Reset</b> aur <b>Edit timer</b> sirf bharosemand staff ko do — ye dono Activity Timeline me log hote hain.</li>
        <li>Staff ka password bhool gaya? Edit → naya password likho. Chhod diya to <b>Account active</b> off kar do.</li>
      </ul>
    </>,
  },
  {
    id: 'shop', who: 'admin', icon: Store, title: 'Shop details, UPI & GST (Owner)',
    body: () => <p><Link to="/setup/shop">Shop Details &amp; Tax</Link>: shop naam, address, phone bill pe chhapte hain. <b>UPI ID</b> daalo to checkout pe scan-to-pay QR aata hai (₹1 test QR se check kar lo). <b>GST</b> on karoge to bill “Tax Invoice” banega aur CGST/SGST alag dikhega; off pe “Bill of Supply”.</p>,
  },
  {
    id: 'members', who: 'memberships', icon: Crown, title: 'Memberships, wallet & loyalty',
    body: () => <p><Link to="/memberships">Memberships</Link> me plan banao (jaise Silver: ₹1000 do → ₹1200 wallet, 30 din). Customer kholo → <b>Recharge wallet</b> → plan + cash/online. Billing me <b>Wallet</b> mode se kat jayega. Loyalty (Owner): har ₹100 pe kitne points, 1 point = kitne ₹, minimum redeem.</p>,
  },
  {
    id: 'tour', who: 'tournaments', icon: Trophy, title: 'Tournaments',
    body: () => <p><Link to="/tournaments">Tournaments</Link> → New: game, date, entry fee, prize pool, max players. Players add karo, entry fee <b>Cash/Online</b> button se lo (Income me jud jata hai), check-in tick karo. Khatam hone pe winners + prize likho → <b>Save results</b> (prize Expenses me jud jata hai).</p>,
  },
  {
    id: 'reports', who: 'reports', icon: LineChart, title: 'Reports',
    body: () => <ul>
      <li><b>Daily Revenue</b>: aaj ka cash, online, wallet, discount, pending udhaar, expenses aur <b>net</b>. Saare bills ki list + Excel export. Din band karte waqt cash gin ke yahi milao.</li>
      <li><b>Monthly Revenue</b>: har din ka graph, expenses category-wise, net profit, GST summary (CA ke liye).</li>
      <li><b>System Usage</b>: kaunsa game/seat kitna kamata hai, kaunsa ghanta sabse busy (peak hour).</li>
      <li><b>Snacks &amp; Stock</b>: best sellers + low stock list.</li>
      <li><b>Activity Timeline</b>: kisne kab Start/Reset/Discount/Edit timer kiya — jhagde ka hal.</li>
      <li><b>Expenses &amp; Income</b>: rent, bijli, salary, stock; aur repair/party jaisi extra income.</li>
    </ul>,
  },
  {
    id: 'devices', who: 'setup', icon: Plug, title: 'Smart plug / TV & PC lock (optional)',
    body: () => <p>Live View &amp; Devices me har seat ke liye <b>Device ON URL</b> aur <b>OFF URL</b> daal sakte ho. Start/Resume pe ON, Pause/Done/Reset pe OFF call hota hai — Tuya, Home Assistant, IFTTT webhook ya apna PC-lock/TV-lock script chala sakte ho (jaise snooker table ki light). Khaali chhodoge to kuch nahi hoga.</p>,
  },
  {
    id: 'routine', who: 'all', icon: ListChecks, title: 'Roz ka routine',
    body: (role) => <>
      <ol className="steps">
        <li><b>Dukaan kholte waqt:</b> login karo, dashboard check karo ki koi purana session reh to nahi gaya.</li>
        <li><b>Din bhar:</b> har customer ke liye Start → Done → Bill. Snacks seat pe hi add karo taaki ek hi bill bane.</li>
        <li><b>Band karte waqt:</b> Billing khaali karo (sab paid/credit), koi seat chal to nahi rahi.{role === 'admin' ? ' Daily Revenue me cash milao, expenses daalo.' : ' Owner ko cash hand-over karo.'}</li>
        <li><b>Logout</b> karo.</li>
      </ol>
    </>,
  },
];

const FAQ = [
  ['Galti se Done dab gaya, customer abhi khel raha hai?', 'Billing card pe ↩ Continue dabao — time wahin se chalu ho jayega.'],
  ['Timer galat start hua / late start kiya?', '⋮ → Edit timer me sahi khela hua time (HH:MM:SS) daalo. (Permission chahiye — har change log hota hai.)'],
  ['Customer ne paise baad me dene bola?', 'Payment me “Pay later” chuno (phone zaroori). Baad me Invoices → Pending → Cash/Online collect.'],
  ['Customer ko doosri seat chahiye?', 'Transfer button → From (chal rahi seat) → To (free seat). Time, players, snacks sab saath jaate hain.'],
  ['Stop timer pe kya hota hai?', 'Set kiye minute poore hote hi session khud band, beep bajti hai aur bill card Billing me aa jata hai.'],
  ['Mobile pe Billing kaha hai?', 'Choti screen pe neeche-right “Billing” button dabao — bill panel neeche se khulega.'],
  ['Internet chala gaya to?', 'Timer server pe chalta hai, time nahi khoyega. Internet aate hi screen refresh ho jayegi.'],
  ['Password bhool gaya?', 'Staff: owner se bolo, wo Manage Staff me naya password set karega. Owner: server pe “npm run seed -- --reset-passwords” chalao (README dekho).'],
  ['Revenue staff ko kyu nahi dikhta?', 'Privacy ke liye. Owner “Reports” permission de to dikhega.'],
];

export default function Help() {
  const { isAdmin, can } = useAuth();
  const role = isAdmin ? 'admin' : 'staff';
  const [q, setQ] = useState('');
  const visible = (s) => s.who === 'all' || (s.who === 'admin' ? isAdmin : can(s.who));
  const secs = useMemo(() => SECTIONS.filter(visible).filter((s) => !q || `${s.title} ${s.id} ${textOf(s.body(role))}`.toLowerCase().includes(q.toLowerCase())), [q, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const faq = FAQ.filter(([a, b]) => !q || (a + b).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Help & Guide" sub={isAdmin ? 'Owner / Admin guide — counter + setup + reports' : 'Staff guide — counter, billing and daily work'}>
        <span className={`badge ${isAdmin ? 'brand' : 'info'}`}><ShieldCheck />{isAdmin ? 'Admin view' : 'Staff view'}</span>
      </PageHead>
      <SearchBox value={q} onChange={setQ} placeholder="Kya dhundh rahe ho? (e.g. discount, transfer, GST, wallet)" style={{ marginBottom: 16 }} />
      <div className="help-grid">
        <nav className="help-toc card" style={{ padding: 8 }}>
          {secs.map((s) => <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{s.title}</a>)}
          <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>FAQ</a>
        </nav>
        <div className="col gap16">
          {secs.map((s) => (
            <section key={s.id} id={s.id} className="card help-sec">
              <h2><s.icon />{s.title}{s.who === 'admin' && <span className="badge brand">Owner</span>}</h2>
              <div style={{ lineHeight: 1.6 }}>{s.body(role)}</div>
            </section>
          ))}
          <section id="faq" className="card help-sec faq">
            <h2><HelpCircle />FAQ — aksar pooche jaane wale sawaal</h2>
            {faq.map(([a, b]) => <details key={a}><summary>{a}</summary><div>{b}</div></details>)}
            {!faq.length && !secs.length && <div className="mute">Kuch nahi mila — doosra shabd try karo.</div>}
          </section>
          <div className="card small mute">Shortcuts: modal band karne ke liye <K>Esc</K>. Customer suggestion me <K>↑</K> <K>↓</K> <K>Enter</K>. Koi dikkat ho to {isAdmin ? 'Activity Timeline check karo.' : 'owner ko batao.'}</div>
        </div>
      </div>
    </>
  );
}
