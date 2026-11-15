import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tags, Plus, Trash2, Save, Monitor, UtensilsCrossed, PackagePlus, UserCog, KeyRound, Store, Crown, Gift, QrCode, Printer, RefreshCw, Link2, Clock, Pencil } from 'lucide-react';
import { PERMISSIONS, DEFAULT_STAFF_PERMS } from '@shared/pricing.js';
import { post, put, del } from '../api.js';
import { useAuth, useFetch, useToast } from '../state.jsx';
import { PageHead, Spinner, Empty, Modal, Field, Switch, Seg, useConfirm, inr, fDateTime } from '../ui.jsx';
import { TYPE_ICON } from '../components/StationCard.jsx';
import { UpiQr } from '../components/Billing.jsx';

const ICONS = [['gamepad', 'Console'], ['monitor', 'PC'], ['circle', 'Pool / Snooker'], ['glasses', 'VR'], ['car', 'Racing sim'], ['joystick', 'Arcade']];

/* ======================= Rate Card ======================= */
export function RateCard() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/types', [], { live: ['stations'] });
  const [rows, setRows] = useState([]);
  useEffect(() => { if (data) setRows(data.map((t) => ({ ...t, rates: [...t.rates] }))); }, [data]);
  const upd = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, dirty: true } : r)));
  const save = async (r) => {
    try {
      const body = { name: r.name, icon: r.icon, blockMinutes: +r.blockMinutes, rates: r.rates.map(Number), active: r.active, order: r.order };
      r._id ? await put(`/types/${r._id}`, body) : await post('/types', body);
      toast(`${r.name} saved`); reload();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const remove = async (r) => {
    if (!r._id) return setRows(rows.filter((x) => x !== r));
    if (!(await confirm({ title: `Delete ${r.name}?`, message: 'Only possible when no station uses this type.', ok: 'Delete', danger: true }))) return;
    try { await del(`/types/${r._id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  if (loading && !data) return <Spinner center />;
  return (
    <>
      <PageHead title="Rate Card" sub="Price per billing block, per number of players. Time is always rounded UP to the next block.">
        <button className="btn btn-primary" onClick={() => setRows([...rows, { name: 'New game type', icon: 'gamepad', blockMinutes: 30, rates: [50], active: true, order: rows.length + 1, dirty: true }])}><Plus />Add game type</button>
      </PageHead>
      <div className="sgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {rows.map((r, i) => {
          const I = TYPE_ICON[r.icon] || TYPE_ICON.gamepad;
          return (
            <div key={r._id || i} className="card col gap12" style={{ borderColor: r.dirty ? 'var(--orange)' : undefined }}>
              <div className="row"><I size={20} color="var(--brand)" /><input className="input" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} style={{ fontWeight: 700 }} /></div>
              <div className="grid2">
                <Field label="Icon"><select className="input" value={r.icon} onChange={(e) => upd(i, { icon: e.target.value })}>{ICONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="Billing block" hint="minutes"><input className="input" type="number" min={1} value={r.blockMinutes} onChange={(e) => upd(i, { blockMinutes: e.target.value })} /></Field>
              </div>
              <div>
                <div className="small b mute mb8">Rate per block (₹)</div>
                <div className="col" style={{ gap: 6 }}>
                  {r.rates.map((x, j) => (
                    <div key={j} className="row">
                      <span className="badge" style={{ width: 70, justifyContent: 'center' }}>{j + 1} player{j ? 's' : ''}</span>
                      <input className="input input-sm" type="number" min={0} value={x} onChange={(e) => upd(i, { rates: r.rates.map((y, k) => (k === j ? e.target.value : y)) })} />
                      {j > 0 && j === r.rates.length - 1 && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => upd(i, { rates: r.rates.slice(0, -1) })}><Trash2 /></button>}
                    </div>
                  ))}
                  {r.rates.length < 8 && <button className="btn btn-sm btn-ghost" onClick={() => upd(i, { rates: [...r.rates, r.rates.at(-1)] })}><Plus />Add {r.rates.length + 1}-player price</button>}
                </div>
              </div>
              <div className="small mute">Example: 70 min, 1 player = {Math.ceil(70 / (+r.blockMinutes || 30))} × {inr(r.rates[0])} = <b>{inr(Math.ceil(70 / (+r.blockMinutes || 30)) * (+r.rates[0] || 0))}</b></div>
              <div className="row"><Switch checked={r.active} onChange={(v) => upd(i, { active: v })} label="Active" /><span className="sp" />
                <button className="btn btn-sm btn-ghost" onClick={() => remove(r)}><Trash2 /></button>
                <button className="btn btn-sm btn-primary" disabled={!r.dirty} onClick={() => save(r)}><Save />Save</button></div>
            </div>
          );
        })}
      </div>
      {isAdmin && <TimeRules />}
    </>
  );
}

function TimeRules() {
  const toast = useToast();
  const { data } = useFetch('/settings');
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF({ graceMinutes: data.graceMinutes, bonus: { ...data.bonus } }); }, [data]);
  if (!f) return null;
  const save = async () => { try { await put('/settings', f); toast('Time rules saved'); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <div className="card mt16 col gap12">
      <div className="row"><Clock size={18} color="var(--orange)" /><h2>Time rules (all stations)</h2></div>
      <div className="grid3">
        <Field label="Grace period" hint="free minutes before the next block is charged"><input className="input" type="number" min={0} max={30} value={f.graceMinutes} onChange={(e) => setF({ ...f, graceMinutes: +e.target.value })} /></Field>
        <Field label="Bonus time: after playing" hint="minutes"><input className="input" type="number" min={1} value={f.bonus.afterMinutes} onChange={(e) => setF({ ...f, bonus: { ...f.bonus, afterMinutes: +e.target.value } })} /></Field>
        <Field label="…give free minutes"><input className="input" type="number" min={0} value={f.bonus.freeMinutes} onChange={(e) => setF({ ...f, bonus: { ...f.bonus, freeMinutes: +e.target.value } })} /></Field>
      </div>
      <div className="row"><Switch checked={f.bonus.enabled} onChange={(v) => setF({ ...f, bonus: { ...f.bonus, enabled: v } })} label="Bonus time ON" /><span className="sp" /><button className="btn btn-primary" onClick={save}><Save />Save rules</button></div>
      <div className="small faint">Example: grace 5 → 35 min on a 30-min block is billed as 1 block. Bonus 120→15 → a 2h15m session is billed as 2h.</div>
    </div>
  );
}

/* ======================= Stations ======================= */
export function Stations() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/stations', [], { live: ['stations'] });
  const { data: types } = useFetch('/types');
  const [add, setAdd] = useState(null);
  const [edit, setEdit] = useState(null);
  const tname = (id) => types?.find((t) => t._id === id)?.name || '—';
  const remove = async (s) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, message: 'Past bills keep the station name. A running seat cannot be deleted.', ok: 'Delete', danger: true }))) return;
    try { await del(`/stations/${s._id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const toggle = async (s, active) => { try { await put(`/stations/${s._id}`, { active }); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHead title="Stations" sub="Every PS5, PC, table or simulator that you bill by time">
        <button className="btn btn-primary" disabled={!types?.length} onClick={() => setAdd({ name: '', type: types?.[0]?._id, count: 1 })}><Plus />Add stations</button>
      </PageHead>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !data?.length ? <Empty icon={Monitor} title="No stations" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>Name</th><th>Type</th><th>Now</th><th>Active</th><th /></tr></thead>
            <tbody>{data.map((s) => (
              <tr key={s._id}>
                <td className="num" style={{ width: 60 }}>{s.order}</td><td><b>{s.name}</b></td><td>{tname(s.type)}</td>
                <td><span className={`badge ${s.session?.state === 'idle' ? '' : 'ok'}`}>{s.session?.state || 'idle'}</span></td>
                <td><Switch checked={s.active} onChange={(v) => toggle(s, v)} /></td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit({ ...s })}><Pencil /></button><button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(s)}><Trash2 /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {add && (
        <Modal title="Add stations" icon={Monitor} size="narrow" onClose={() => setAdd(null)}>
          <form className="col gap12" onSubmit={async (e) => { e.preventDefault(); try { const r = await post('/stations', add); toast(`${r.length} station(s) added`); setAdd(null); reload(); } catch (x) { toast(x.message, 'bad'); } }}>
            <Field label="Type"><select className="input" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
            <Field label="Name" hint={add.count > 1 ? `numbered: ${add.name || 'PS5'} 1, ${add.name || 'PS5'} 2…` : ''}><input className="input" required value={add.name} placeholder="e.g. PS5" onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="How many?"><input className="input" type="number" min={1} max={20} value={add.count} onChange={(e) => setAdd({ ...add, count: +e.target.value })} /></Field>
            <button className="btn btn-primary btn-block">Add</button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title={`Edit ${edit.name}`} icon={Monitor} size="narrow" onClose={() => setEdit(null)}>
          <form className="col gap12" onSubmit={async (e) => { e.preventDefault(); try { await put(`/stations/${edit._id}`, { name: edit.name, type: edit.type, order: +edit.order }); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(x.message, 'bad'); } }}>
            <Field label="Name"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
            <Field label="Display order"><input className="input" type="number" value={edit.order} onChange={(e) => setEdit({ ...edit, order: e.target.value })} /></Field>
            <button className="btn btn-primary btn-block">Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ======================= Snacks & Grill menu ======================= */
export function Menu() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/snacks', [], { live: ['snacks', 'invoices'] });
  const { data: settings } = useFetch('/settings');
  const [edit, setEdit] = useState(null);
  const [stock, setStock] = useState(null);
  const low = settings?.lowStockAlert ?? 5;
  const remove = async (s) => {
    if (!(await confirm({ title: `Delete ${s.name}?`, message: 'Tip: switch it off instead to keep it for later.', ok: 'Delete', danger: true }))) return;
    try { await del(`/snacks/${s._id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const save = async (e) => {
    e.preventDefault();
    try { edit._id ? await put(`/snacks/${edit._id}`, edit) : await post('/snacks', edit); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <>
      <PageHead title="Snacks & Grill Menu" sub={`Prices and stock. Stock goes down automatically on every bill. Low-stock alert at ${low}.`}>
        <button className="btn btn-primary" onClick={() => setEdit({ name: '', price: '', category: 'Snacks', stock: 0, trackStock: true, active: true })}><Plus />Add item</button>
      </PageHead>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !data?.length ? <Empty icon={UtensilsCrossed} title="Menu is empty" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Item</th><th className="hide-sm">Category</th><th className="num">Price</th><th className="num">Stock</th><th>On menu</th><th /></tr></thead>
            <tbody>{data.map((s) => (
              <tr key={s._id} style={{ opacity: s.active ? 1 : 0.5 }}>
                <td><b>{s.name}</b></td><td className="hide-sm small">{s.category}</td><td className="num">{inr(s.price)}</td>
                <td className="num">{s.trackStock ? <span className={`badge ${s.stock <= low ? 'warn' : ''}`}>{s.stock}</span> : <span className="faint small">—</span>}</td>
                <td><Switch checked={s.active} onChange={async (v) => { await put(`/snacks/${s._id}`, { active: v }).catch((e) => toast(e.message, 'bad')); reload(); }} /></td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  {s.trackStock && <button className="btn btn-sm" onClick={() => setStock({ ...s, delta: '', note: '' })}><PackagePlus />Stock</button>}
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit({ ...s })}><Pencil /></button>
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(s)}><Trash2 /></button>
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {edit && (
        <Modal title={edit._id ? `Edit ${edit.name}` : 'Add item'} icon={UtensilsCrossed} size="narrow" onClose={() => setEdit(null)}>
          <form className="col gap12" onSubmit={save}>
            <Field label="Name"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Price ₹"><input className="input" required inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              <Field label="Category"><input className="input" list="snackcats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /><datalist id="snackcats">{['Grill', 'Snacks', 'Drinks', 'Desserts', 'Combos'].map((c) => <option key={c} value={c} />)}</datalist></Field>
            </div>
            <Switch checked={edit.trackStock} onChange={(v) => setEdit({ ...edit, trackStock: v })} label="Track stock for this item" />
            {edit.trackStock && !edit._id && <Field label="Opening stock"><input className="input" type="number" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></Field>}
            <button className="btn btn-primary btn-block">Save</button>
          </form>
        </Modal>
      )}
      {stock && (
        <Modal title={`Stock — ${stock.name}`} icon={PackagePlus} size="narrow" onClose={() => setStock(null)}>
          <form className="col gap12" onSubmit={async (e) => { e.preventDefault(); try { await post(`/snacks/${stock._id}/stock`, { delta: +stock.delta, note: stock.note }); toast('Stock updated'); setStock(null); reload(); } catch (x) { toast(x.message, 'bad'); } }}>
            <div className="mute small">Now in stock: <b>{stock.stock}</b>. Use + for a new delivery, − for damaged / expired (write-off). Every change is logged.</div>
            <Field label="Quantity (+ / −)"><input className="input" type="number" required autoFocus placeholder="e.g. 24 or -2" value={stock.delta} onChange={(e) => setStock({ ...stock, delta: e.target.value })} /></Field>
            <Field label="Note" hint="optional"><input className="input" value={stock.note} placeholder="Supplier bill no / reason" onChange={(e) => setStock({ ...stock, note: e.target.value })} /></Field>
            <button className="btn btn-primary btn-block">Update stock</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ======================= Staff ======================= */
export function Staff() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/users');
  const [edit, setEdit] = useState(null);
  const remove = async (u) => {
    if (!(await confirm({ title: `Delete ${u.name}?`, message: 'They will not be able to log in. Their past activity stays in the timeline.', ok: 'Delete', danger: true }))) return;
    try { await del(`/users/${u.id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const save = async (e) => {
    e.preventDefault();
    const body = { name: edit.name, username: edit.username, phone: edit.phone, role: edit.role, permissions: edit.permissions, active: edit.active, ...(edit.password ? { password: edit.password } : {}) };
    try { edit.id ? await put(`/users/${edit.id}`, body) : await post('/users', body); toast('Saved'); setEdit(null); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  const perms = (u) => (u.role === 'admin' ? 'Everything' : PERMISSIONS.filter(([k]) => u.permissions.includes(k)).map(([, l]) => l).join(', ') || 'Dashboard only');
  return (
    <>
      <PageHead title="Manage Staff" sub="Separate login for every person. Staff never see revenue or reports unless you allow it.">
        <button className="btn btn-primary" onClick={() => setEdit({ name: '', username: '', password: '', role: 'staff', permissions: [...DEFAULT_STAFF_PERMS], active: true })}><Plus />Add staff</button>
      </PageHead>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Login ID</th><th>Role</th><th className="hide-sm">Can do</th><th className="hide-sm">Last login</th><th /></tr></thead>
            <tbody>{(data || []).map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                <td><b>{u.name}</b>{!u.active && <span className="badge bad" style={{ marginLeft: 6 }}>disabled</span>}</td><td className="small">@{u.username}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'brand' : ''}`}>{u.role === 'admin' ? 'Owner / Admin' : 'Staff'}</span></td>
                <td className="small mute hide-sm" style={{ maxWidth: 360 }}>{perms(u)}</td><td className="small hide-sm">{fDateTime(u.lastLoginAt)}</td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit({ ...u, password: '' })}><Pencil /></button>{u.id !== user.id && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(u)}><Trash2 /></button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add staff'} icon={UserCog} onClose={() => setEdit(null)}>
          <form className="col gap12" onSubmit={save}>
            <div className="grid2">
              <Field label="Full name"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Phone" hint="optional"><input className="input" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Login ID"><input className="input" required disabled={!!edit.id} autoCapitalize="none" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></Field>
              <Field label={edit.id ? 'New password' : 'Password'} hint={edit.id ? 'leave blank to keep' : 'min 6'}><input className="input" type="text" autoComplete="new-password" required={!edit.id} minLength={6} value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            </div>
            {edit.id !== user.id && <Field label="Role"><Seg value={edit.role} onChange={(r) => setEdit({ ...edit, role: r })} options={[['staff', 'Staff'], ['admin', 'Owner / Admin']]} /></Field>}
            {edit.role === 'staff' && (
              <div>
                <div className="small b mute mb8">What can this person do? (Dashboard is always allowed)</div>
                <div className="grid2" style={{ gap: 8 }}>
                  {PERMISSIONS.map(([k, l]) => <label key={k} className="check small"><input type="checkbox" checked={edit.permissions.includes(k)} onChange={(e) => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, k] : edit.permissions.filter((x) => x !== k) })} />{l}</label>)}
                </div>
              </div>
            )}
            {edit.id && edit.id !== user.id && <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Account active (can log in)" />}
            <button className="btn btn-primary btn-block"><KeyRound />Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ======================= Shop details & tax ======================= */
export function ShopDetails() {
  const toast = useToast();
  const { setShop } = useAuth();
  const { data } = useFetch('/settings');
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF({ ...data, gst: { ...data.gst } }); }, [data]);
  if (!f) return <Spinner center />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { const s = await put('/settings', f); setShop({ shopName: s.shopName, tagline: s.tagline }); toast('Shop details saved'); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <form onSubmit={save}>
      <PageHead title="Shop Details & Tax" sub="Printed on every bill and WhatsApp receipt"><button className="btn btn-primary"><Save />Save</button></PageHead>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card col gap12">
          <div className="row"><Store size={18} color="var(--orange)" /><h2>Shop</h2></div>
          <Field label="Shop name"><input className="input" required value={f.shopName} onChange={set('shopName')} /></Field>
          <Field label="Tagline"><input className="input" value={f.tagline || ''} onChange={set('tagline')} /></Field>
          <Field label="Address"><textarea className="input" value={f.address || ''} onChange={set('address')} /></Field>
          <div className="grid2">
            <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={set('email')} /></Field>
          </div>
        </div>
        <div className="col gap16">
          <div className="card col gap12">
            <div className="row"><QrCode size={18} color="var(--orange)" /><h2>Payments &amp; bill</h2></div>
            <Field label="UPI ID" hint="shows a scan-to-pay QR at checkout"><input className="input" placeholder="yourshop@okicici" value={f.upiId || ''} onChange={set('upiId')} /></Field>
            {f.upiId && <div className="row gap12"><UpiQr upiId={f.upiId} shopName={f.shopName} amount={1} note="Test" size={96} /><span className="small mute">Test QR for ₹1 — scan with any UPI app to check the ID.</span></div>}
            <div className="grid2">
              <Field label="Invoice prefix"><input className="input" maxLength={6} value={f.invoicePrefix || ''} onChange={set('invoicePrefix')} /></Field>
              <Field label="Low-stock alert at"><input className="input" type="number" min={0} value={f.lowStockAlert} onChange={set('lowStockAlert')} /></Field>
            </div>
            <Field label="Bill footer"><input className="input" value={f.invoiceFooter || ''} onChange={set('invoiceFooter')} /></Field>
          </div>
          <div className="card col gap12">
            <div className="row"><Tags size={18} color="var(--orange)" /><h2>GST</h2><span className="sp" /><Switch checked={f.gst.enabled} onChange={(v) => setF({ ...f, gst: { ...f.gst, enabled: v } })} label={f.gst.enabled ? 'On' : 'Off'} /></div>
            {f.gst.enabled ? (
              <div className="grid2">
                <Field label="GSTIN"><input className="input" maxLength={15} value={f.gst.gstin || ''} onChange={(e) => setF({ ...f, gst: { ...f.gst, gstin: e.target.value.toUpperCase() } })} /></Field>
                <Field label="GST rate %" hint="added on top"><input className="input" type="number" min={0} max={28} value={f.gst.rate} onChange={(e) => setF({ ...f, gst: { ...f.gst, rate: +e.target.value } })} /></Field>
              </div>
            ) : <div className="small mute">Bills print as “Bill of Supply” without tax.</div>}
          </div>
        </div>
      </div>
    </form>
  );
}

/* ======================= Memberships & Rewards ======================= */
export function Memberships() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useFetch('/plans');
  const [edit, setEdit] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try { edit._id ? await put(`/plans/${edit._id}`, edit) : await post('/plans', edit); toast('Plan saved'); setEdit(null); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: `Delete ${p.name}?`, message: 'Customers keep their wallet balance.', ok: 'Delete', danger: true }))) return;
    try { await del(`/plans/${p._id}`); reload(); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <>
      <PageHead title="Memberships & Rewards" sub="Prepaid wallet plans (pay ₹1000 → get ₹1200) and loyalty points">
        <button className="btn btn-primary" onClick={() => setEdit({ name: '', price: '', credit: '', validityDays: 30, active: true })}><Plus />New plan</button>
      </PageHead>
      {loading && !data ? <Spinner center /> : (
        <div className="sgrid mb16">
          {(data || []).map((p) => (
            <div key={p._id} className="card col" style={{ gap: 8, opacity: p.active ? 1 : 0.55 }}>
              <div className="row"><Crown size={18} color="var(--brand)" /><b style={{ fontSize: 16 }}>{p.name}</b><span className="sp" />{!p.active && <span className="badge">off</span>}</div>
              <div style={{ fontSize: 22, fontWeight: 850 }}>Pay {inr(p.price)} <span className="mute" style={{ fontSize: 14 }}>→</span> <span className="brand-text">{inr(p.credit)}</span></div>
              <div className="small mute">Wallet valid {p.validityDays} days · bonus {inr(p.credit - p.price)} ({p.price ? Math.round(((p.credit - p.price) / p.price) * 100) : 0}%)</div>
              <div className="row"><span className="sp" /><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit({ ...p })}><Pencil /></button><button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(p)}><Trash2 /></button></div>
            </div>
          ))}
          {!data?.length && <div className="card"><Empty icon={Crown} title="No plans yet" /></div>}
        </div>
      )}
      <div className="card small mute mb16">To sell a plan: open <Link to="/customers">Customers</Link> → pick the customer → <b>Recharge wallet</b>. At billing choose <b>Wallet</b> as payment mode.</div>
      {isAdmin && <LoyaltyCard />}
      {edit && (
        <Modal title={edit._id ? 'Edit plan' : 'New plan'} icon={Crown} size="narrow" onClose={() => setEdit(null)}>
          <form className="col gap12" onSubmit={save}>
            <Field label="Plan name"><input className="input" required value={edit.name} placeholder="Silver / Gold / Student" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Customer pays ₹"><input className="input" required inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              <Field label="Wallet credit ₹"><input className="input" required inputMode="decimal" value={edit.credit} onChange={(e) => setEdit({ ...edit, credit: e.target.value })} /></Field>
            </div>
            <Field label="Valid for (days)"><input className="input" type="number" min={1} value={edit.validityDays} onChange={(e) => setEdit({ ...edit, validityDays: e.target.value })} /></Field>
            <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Available for sale" />
            <button className="btn btn-primary btn-block">Save plan</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function LoyaltyCard() {
  const toast = useToast();
  const { data } = useFetch('/settings');
  const [l, setL] = useState(null);
  useEffect(() => { if (data) setL({ ...data.loyalty }); }, [data]);
  if (!l) return null;
  const save = async () => { try { await put('/settings', { loyalty: l }); toast('Loyalty saved'); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <div className="card col gap12">
      <div className="row"><Gift size={18} color="var(--orange)" /><h2>Loyalty points</h2><span className="sp" /><Switch checked={l.enabled} onChange={(v) => setL({ ...l, enabled: v })} label={l.enabled ? 'On' : 'Off'} /></div>
      <div className="grid3">
        <Field label="Points per ₹100 paid"><input className="input" type="number" min={0} value={l.pointsPer100} onChange={(e) => setL({ ...l, pointsPer100: +e.target.value })} /></Field>
        <Field label="₹ value of 1 point"><input className="input" type="number" min={0} step="0.1" value={l.pointValue} onChange={(e) => setL({ ...l, pointValue: +e.target.value })} /></Field>
        <Field label="Minimum to redeem"><input className="input" type="number" min={0} value={l.minRedeem} onChange={(e) => setL({ ...l, minRedeem: +e.target.value })} /></Field>
      </div>
      <div className="row"><span className="small mute">Example: ₹1000 bill → {Math.floor(10 * l.pointsPer100)} points = {inr(Math.floor(10 * l.pointsPer100) * l.pointValue)} off next time. Wallet payments don’t earn points.</span><span className="sp" /><button className="btn btn-primary" onClick={save}><Save />Save</button></div>
    </div>
  );
}

/* ======================= Live View & Devices ======================= */
export function Integrations() {
  const toast = useToast();
  const { data, loading, reload } = useFetch('/stations');
  const [qr, setQr] = useState(null);
  const [hooks, setHooks] = useState({});
  const origin = window.location.origin;
  const saveHooks = async (s) => {
    try { await put(`/stations/${s._id}`, { webhookOn: hooks[s._id]?.on ?? s.webhookOn ?? '', webhookOff: hooks[s._id]?.off ?? s.webhookOff ?? '' }); toast(`${s.name} devices saved`); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const newLink = async (s) => { try { await post(`/stations/${s._id}/new-link`); toast('New link made — reprint the QR'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHead title="Live View & Devices" sub="Customer QR per seat, and webhooks to switch smart plugs / TV & PC locks on Start and Done" />
      <div className="card mb16 small mute col" style={{ gap: 6 }}>
        <div><b style={{ color: 'var(--ink)' }}>Live Session View:</b> stick the QR on each seat. Customers scan it to see their running time and bill on their phone — no app or login.</div>
        <div><b style={{ color: 'var(--ink)' }}>Devices (optional):</b> paste a URL that turns a device ON (called on Start / Resume) and OFF (on Pause / Done / Reset). Works with Tuya / Home Assistant / IFTTT webhooks, or your own PC-lock / TV-lock script. Leave blank if not used.</div>
      </div>
      {loading && !data ? <Spinner center /> : (
        <div className="sgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
          {(data || []).map((s) => {
            const url = `${origin}/live/${s.publicToken}`;
            const h = hooks[s._id] || {};
            return (
              <div key={s._id} className="card col gap12">
                <div className="row"><b style={{ fontSize: 15 }}>{s.name}</b><span className="sp" />
                  <button className="btn btn-sm" onClick={() => setQr(s)}><QrCode />QR</button>
                  <button className="btn btn-sm btn-ghost btn-icon" title="Make a new link (old QR stops working)" onClick={() => newLink(s)}><RefreshCw /></button></div>
                <a className="small" href={url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}><Link2 size={12} /> {url}</a>
                <Field label="Device ON URL"><input className="input input-sm" placeholder="https://…" value={h.on ?? s.webhookOn ?? ''} onChange={(e) => setHooks({ ...hooks, [s._id]: { ...h, on: e.target.value } })} /></Field>
                <Field label="Device OFF URL"><input className="input input-sm" placeholder="https://…" value={h.off ?? s.webhookOff ?? ''} onChange={(e) => setHooks({ ...hooks, [s._id]: { ...h, off: e.target.value } })} /></Field>
                <button className="btn btn-sm" disabled={!hooks[s._id]} onClick={() => saveHooks(s)}><Save />Save devices</button>
              </div>
            );
          })}
        </div>
      )}
      {qr && <QrModal s={qr} url={`${origin}/live/${qr.publicToken}`} onClose={() => setQr(null)} />}
    </>
  );
}

function QrModal({ s, url, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => { import('qrcode').then((Q) => Q.toDataURL(url, { margin: 1, width: 480 })).then(setSrc); }, [url]);
  return (
    <Modal title={`${s.name} — scan QR`} icon={QrCode} size="narrow" onClose={onClose} footer={<><button className="btn" onClick={() => window.print()}><Printer />Print</button><button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <div className="receipt print-area center">
        <img src="/logo-256.webp" alt="" width="64" height="64" style={{ borderRadius: '50%' }} />
        <h3 className="mt8" style={{ fontSize: 18 }}>{s.name}</h3>
        <div className="small mute mb8">Scan to see your time &amp; bill</div>
        {src ? <img src={src} alt="QR code" width="240" height="240" /> : <div className="skeleton" style={{ width: 240, height: 240, margin: '0 auto' }} />}
        <div className="tiny mute mt8" style={{ wordBreak: 'break-all' }}>{url}</div>
      </div>
    </Modal>
  );
}

