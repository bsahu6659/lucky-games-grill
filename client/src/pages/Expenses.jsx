import { useState } from 'react';
import { Wallet, Plus, Trash2, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { post, put, del } from '../api.js';
import { useFetch, useToast } from '../state.jsx';
import { PageHead, Spinner, Empty, Modal, Field, Seg, useConfirm, inr, todayKey, dayLabel } from '../ui.jsx';

const CATS = { expense: ['Rent', 'Electricity', 'Internet', 'Salary', 'Snacks stock', 'Grill supplies', 'Repairs', 'Games / subscriptions', 'Marketing', 'Tournament prize', 'Other'], income: ['Tournament entry', 'Repair service', 'Accessory sale', 'Event / party booking', 'Other'] };

export default function Expenses() {
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [edit, setEdit] = useState(null);
  const { data, loading, reload } = useFetch(`/expenses?month=${month}`, [], { live: ['expenses'] });
  const list = data || [];
  const exp = list.filter((x) => x.kind === 'expense').reduce((a, x) => a + x.amount, 0);
  const inc = list.filter((x) => x.kind === 'income').reduce((a, x) => a + x.amount, 0);
  const remove = async (x) => {
    if (!(await confirm({ title: 'Delete entry?', message: `${x.category} · ${inr(x.amount)}`, ok: 'Delete', danger: true }))) return;
    try { await del(`/expenses/${x._id}`); toast('Deleted'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      <PageHead title="Expenses & Income" sub="Rent, salaries, stock — and income that isn't a bill (repairs, events). Used for net profit in reports.">
        <input type="month" className="input" style={{ width: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn" onClick={() => setEdit({ kind: 'income', date: todayKey(), category: 'Other', mode: 'cash' })}><TrendingUp />Add income</button>
        <button className="btn btn-primary" onClick={() => setEdit({ kind: 'expense', date: todayKey(), category: 'Other', mode: 'cash' })}><Plus />Add expense</button>
      </PageHead>
      <div className="stats mb16">
        <div className="stat"><div className="k"><TrendingDown size={14} />Expenses</div><div className="v" style={{ color: 'var(--bad)' }}>{inr(exp)}</div></div>
        <div className="stat"><div className="k"><TrendingUp size={14} />Other income</div><div className="v" style={{ color: 'var(--ok)' }}>{inr(inc)}</div></div>
        <div className="stat hl"><div className="k">Entries</div><div className="v">{list.length}</div></div>
      </div>
      <div className="card card-pad0">
        {loading && !data ? <Spinner center /> : !list.length ? <Empty icon={Wallet} title="Nothing recorded this month" /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th className="hide-sm">Note</th><th>Mode</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x._id}>
                <td className="small">{dayLabel(x.date)}</td>
                <td><span className={`badge ${x.kind === 'income' ? 'ok' : 'bad'}`}>{x.kind === 'income' ? '+' : '−'}</span> {x.category}</td>
                <td className="small mute hide-sm">{x.note}{x.createdBy?.name ? ` · ${x.createdBy.name}` : ''}</td>
                <td className="small">{x.mode}</td>
                <td className="num b">{inr(x.amount)}</td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEdit(x)}><Pencil /></button><button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove(x)}><Trash2 /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <EntryModal value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function EntryModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: '', note: '', ...value });
  const save = async (e) => {
    e.preventDefault();
    try { f._id ? await put(`/expenses/${f._id}`, f) : await post('/expenses', f); toast('Saved'); onSaved(); } catch (x) { toast(x.message, 'bad'); }
  };
  return (
    <Modal title={f._id ? 'Edit entry' : f.kind === 'income' ? 'Add income' : 'Add expense'} icon={Wallet} size="narrow" onClose={onClose}>
      <form className="col gap12" onSubmit={save}>
        <Seg value={f.kind} onChange={(k) => setF({ ...f, kind: k, category: 'Other' })} options={[['expense', 'Expense'], ['income', 'Income']]} />
        <div className="grid2">
          <Field label="Date"><input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Amount ₹"><input className="input" inputMode="decimal" required autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        </div>
        <Field label="Category"><input className="input" list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /><datalist id="cats">{CATS[f.kind].map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Paid / received by"><Seg value={f.mode} onChange={(m) => setF({ ...f, mode: m })} options={[['cash', 'Cash'], ['online', 'Online']]} /></Field>
        <Field label="Note" hint="optional"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Modal>
  );
}
