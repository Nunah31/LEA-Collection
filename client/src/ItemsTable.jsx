import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { buildWhatsAppLink, buildMailtoLink, isOverdue } from './helpers';

const FIELDS = [
  { key: 'task', label: 'משימה' },
  { key: 'follow_up_date', label: 'תאריך מעקב', type: 'date' },
  { key: 'customer_name', label: 'שם לקוח' },
  { key: 'customer_phone', label: 'נייד לקוח', dir: 'ltr' },
  { key: 'customer_email', label: 'כתובת מייל', dir: 'ltr' },
  { key: 'debt_amount', label: 'סכום החוב' },
  { key: 'invoice_number', label: "מס' חשבונית" },
  { key: 'balance_due', label: 'יתרה לתשלום' },
  { key: 'payment_method', label: 'אמצעי תשלום' },
  { key: 'notes', label: 'הערות' },
];

const emptyItem = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));

export default function ItemsTable({ client }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState(emptyItem());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.getItems(client.id).then(setItems).finally(() => setLoading(false));
  }, [client.id]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('items-refresh', refresh);
    return () => window.removeEventListener('items-refresh', refresh);
  }, [load]);

  const addItem = async (e) => {
    e.preventDefault();
    await api.createItem(client.id, newItem);
    setNewItem(emptyItem());
    setShowAdd(false);
    load();
  };

  const startEdit = (item) => { setEditingId(item.id); setEditDraft({ ...item }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const saveEdit = async () => {
    await api.updateItem(editingId, editDraft);
    cancelEdit();
    load();
  };
  const removeItem = async (item) => {
    if (!confirm(`למחוק את הרשומה של "${item.customer_name || item.task}"?`)) return;
    await api.deleteItem(item.id);
    load();
  };

  const filtered = items.filter((it) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return [it.customer_name, it.task, it.invoice_number, it.notes].some((v) => (v || '').toLowerCase().includes(s));
  });

  return (
    <div className="items-table-wrap">
      <div className="table-toolbar">
        <h2>{client.name} — רשימת גבייה</h2>
        <input className="search" placeholder="🔎 חיפוש לפי שם, משימה, מס' חשבונית…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'ביטול' : '➕ הוספת גבייה חדשה'}</button>
      </div>

      {showAdd && (
        <form className="add-form" onSubmit={addItem}>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type={f.type || 'text'}
                dir={f.dir || 'auto'}
                value={newItem[f.key]}
                onChange={(e) => setNewItem((it) => ({ ...it, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="form-actions">
            <button type="submit">💾 שמירה</button>
          </div>
        </form>
      )}

      {loading ? (
        <p>טוען…</p>
      ) : filtered.length === 0 ? (
        <p className="empty">אין רשומות עדיין. אפשר להוסיף גבייה חדשה, או לסנכרן מ-Google Sheets.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const editing = editingId === item.id;
                const overdue = isOverdue(item.follow_up_date);
                return (
                  <tr key={item.id} className={overdue ? 'overdue' : ''}>
                    {FIELDS.map((f) => (
                      <td key={f.key} dir={f.dir || 'auto'}>
                        {editing ? (
                          <input
                            type={f.type || 'text'}
                            dir={f.dir || 'auto'}
                            value={editDraft[f.key] || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                          />
                        ) : (
                          item[f.key] || ''
                        )}
                      </td>
                    ))}
                    <td className="actions-cell">
                      {editing ? (
                        <>
                          <button onClick={saveEdit} title="שמירה">💾</button>
                          <button onClick={cancelEdit} title="ביטול">✖️</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(item)} title="עריכה">✏️</button>
                          <button onClick={() => removeItem(item)} title="מחיקה" className="danger">🗑</button>
                          <a className="btn-link wa" href={buildWhatsAppLink(item)} target="_blank" rel="noreferrer" title="שליחת תזכורת בוואטסאפ">💬</a>
                          <a className="btn-link mail" href={buildMailtoLink(item)} title="שליחת תזכורת במייל">✉️</a>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
