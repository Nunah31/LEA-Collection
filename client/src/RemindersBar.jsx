import { useEffect, useState } from 'react';
import { api } from './api';

export default function RemindersBar({ onPick }) {
  const [reminders, setReminders] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => api.getReminders().then(setReminders).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    const refresh = () => load();
    window.addEventListener('items-refresh', refresh);
    return () => { clearInterval(t); window.removeEventListener('items-refresh', refresh); };
  }, []);

  if (!reminders.length) return null;

  return (
    <div className="reminders-bar">
      <button className="reminders-toggle" onClick={() => setOpen((o) => !o)}>
        🔔 {reminders.length} תזכורות לטיפול היום או באיחור {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul className="reminders-list">
          {reminders.map((r) => (
            <li key={r.id} onClick={() => { onPick(r.client_id); setOpen(false); }}>
              <span className="rem-date">{r.follow_up_date}</span>
              <span className="rem-client">{r.client_name}</span>
              <span className="rem-name">{r.customer_name || '—'}</span>
              <span className="rem-task">{r.task || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
