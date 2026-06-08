import { useState } from 'react';
import { api } from './api';

export default function ClientManager({ clients, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const reset = () => { setName(''); setSheetUrl(''); setEditingId(null); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('יש להזין שם לקוח'); return; }
    try {
      if (editingId) {
        await api.updateClient(editingId, { name: name.trim(), sheet_url: sheetUrl.trim() });
      } else {
        await api.createClient({ name: name.trim(), sheet_url: sheetUrl.trim() });
      }
      reset();
      await onChanged();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const edit = (c) => {
    setEditingId(c.id);
    setName(c.name);
    setSheetUrl(c.sheet_url || '');
  };

  const remove = async (c) => {
    if (!confirm(`למחוק את הלקוח "${c.name}"? כל הרשומות המקושרות יוסרו מהאפליקציה (לא מ-Google Sheets).`)) return;
    await api.deleteClient(c.id);
    if (editingId === c.id) reset();
    await onChanged();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>ניהול לקוחות</h2>
        <p className="hint">כל לקוח יכול להיות מקושר לקובץ Google Sheets נפרד משלו (הדביקי את הקישור לשיתוף של הקובץ).</p>

        <form onSubmit={submit} className="client-form">
          <label>
            שם הלקוח
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder='לדוגמה: קומפון' />
          </label>
          <label>
            קישור ל-Google Sheet (אופציונלי)
            <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder='https://docs.google.com/spreadsheets/d/...' dir="ltr" />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <button type="submit">{editingId ? 'עדכון לקוח' : '➕ הוספת לקוח'}</button>
            {editingId && <button type="button" onClick={reset}>ביטול עריכה</button>}
          </div>
        </form>

        <ul className="client-list">
          {clients.map((c) => (
            <li key={c.id}>
              <div className="client-row">
                <strong>{c.name}</strong>
                {c.sheet_id ? <span className="badge ok">מקושר ל-Sheet</span> : <span className="badge">ללא Sheet</span>}
              </div>
              <div className="client-row-actions">
                <button onClick={() => edit(c)}>✏️ עריכה</button>
                <button onClick={() => remove(c)} className="danger">🗑 מחיקה</button>
              </div>
            </li>
          ))}
          {clients.length === 0 && <li className="empty">אין עדיין לקוחות</li>}
        </ul>

        <div className="modal-actions">
          <button onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}
