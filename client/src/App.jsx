import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import ClientManager from './ClientManager';
import ItemsTable from './ItemsTable';
import GoogleSetup from './GoogleSetup';
import RemindersBar from './RemindersBar';
import './App.css';

export default function App() {
  const [clients, setClients] = useState([]);
  const [activeClientId, setActiveClientId] = useState(() => localStorage.getItem('activeClientId') || '');
  const [showClientManager, setShowClientManager] = useState(false);
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [googleStatus, setGoogleStatus] = useState({ hasCredentials: false, authorized: false });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const loadClients = useCallback(async () => {
    const list = await api.getClients();
    setClients(list);
    setActiveClientId((current) => {
      if (current && list.some((c) => c.id === current)) return current;
      return list.length ? list[0].id : '';
    });
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    try { setGoogleStatus(await api.googleStatus()); } catch {}
  }, []);

  useEffect(() => { loadClients(); loadGoogleStatus(); }, []);
  useEffect(() => { localStorage.setItem('activeClientId', activeClientId || ''); }, [activeClientId]);

  const activeClient = clients.find((c) => c.id === activeClientId) || null;

  const handleSync = useCallback(async () => {
    if (!activeClient) return;
    if (!activeClient.sheet_id) { setSyncMsg('ללקוח זה אין קישור ל-Google Sheet'); return; }
    if (!googleStatus.authorized) { setShowGoogleSetup(true); return; }
    setSyncing(true);
    setSyncMsg('מסנכרן...');
    try {
      const r = await api.syncClient(activeClient.id);
      setSyncMsg(`סונכרן ✓ (${r.pulled} חדשים מהטבלה, ${r.pushedNew} נשלחו לטבלה, ${r.updated + r.pushedUpdates} עודכנו)`);
      window.dispatchEvent(new CustomEvent('items-refresh'));
    } catch (e) {
      setSyncMsg('שגיאת סנכרון: ' + e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 6000);
    }
  }, [activeClient, googleStatus]);

  // auto-sync every 60s if authorized & sheet linked
  useEffect(() => {
    if (!activeClient?.sheet_id || !googleStatus.authorized) return;
    const t = setInterval(() => { handleSync(); }, 60000);
    return () => clearInterval(t);
  }, [activeClient, googleStatus, handleSync]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>📋 ניהול גבייה</h1>
        <div className="topbar-controls">
          <select
            className="client-select"
            value={activeClientId}
            onChange={(e) => setActiveClientId(e.target.value)}
          >
            {clients.length === 0 && <option value="">אין לקוחות עדיין</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => setShowClientManager(true)}>⚙️ ניהול לקוחות</button>
          <button onClick={() => setShowGoogleSetup(true)} className={googleStatus.authorized ? 'connected' : ''}>
            {googleStatus.authorized ? '🟢 מחובר ל-Google' : '🔌 חיבור ל-Google Sheets'}
          </button>
          {activeClient?.sheet_id && (
            <button onClick={handleSync} disabled={syncing}>{syncing ? 'מסנכרן…' : '🔄 סנכרן עכשיו'}</button>
          )}
        </div>
      </header>

      {syncMsg && <div className="sync-msg">{syncMsg}</div>}

      <RemindersBar onPick={(clientId) => setActiveClientId(clientId)} />

      <main>
        {!activeClient && (
          <div className="empty-state">
            <p>עדיין אין לקוחות. לחצי על "ניהול לקוחות" כדי להוסיף לקוח חדש (אפשר לקשר אותו לקובץ Google Sheets).</p>
            <button onClick={() => setShowClientManager(true)}>➕ הוספת לקוח</button>
          </div>
        )}
        {activeClient && <ItemsTable client={activeClient} />}
      </main>

      {showClientManager && (
        <ClientManager
          clients={clients}
          onClose={() => setShowClientManager(false)}
          onChanged={loadClients}
        />
      )}
      {showGoogleSetup && (
        <GoogleSetup
          status={googleStatus}
          onClose={() => setShowGoogleSetup(false)}
          onChanged={loadGoogleStatus}
        />
      )}
    </div>
  );
}
