import express from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';
import db from './db.js';
import * as google from './google.js';
import { syncClient, pushSingleItem } from './sync.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 4000;

// ---------- Google auth ----------
app.get('/api/google/status', (req, res) => {
  res.json({ hasCredentials: google.hasCredentials(), authorized: google.isAuthorized() });
});

app.post('/api/google/credentials', (req, res) => {
  try {
    google.saveCredentialsFile(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/google/auth-url', (req, res) => {
  const url = google.getAuthUrl();
  if (!url) return res.status(400).json({ error: 'no_credentials' });
  res.json({ url });
});

app.get('/api/google/oauth2callback', async (req, res) => {
  try {
    await google.handleOAuthCallback(req.query.code);
    res.send('<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>החיבור לגוגל הצליח! ✅</h2><p>אפשר לסגור את החלון ולחזור לאפליקציה.</p></body></html>');
  } catch (e) {
    res.status(500).send('שגיאה בחיבור לגוגל: ' + e.message);
  }
});

// ---------- Clients ----------
app.get('/api/clients', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  res.json(clients);
});

app.post('/api/clients', (req, res) => {
  const { name, sheet_url, sheet_tab } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = nanoid();
  const sheet_id = google.extractSheetId(sheet_url || '');
  db.prepare('INSERT INTO clients (id, name, sheet_id, sheet_url, sheet_tab) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, sheet_id, sheet_url || null, sheet_tab || 'Sheet1');
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(id));
});

app.put('/api/clients/:id', (req, res) => {
  const { name, sheet_url, sheet_tab } = req.body;
  const sheet_id = google.extractSheetId(sheet_url || '');
  db.prepare('UPDATE clients SET name = ?, sheet_url = ?, sheet_id = ?, sheet_tab = ? WHERE id = ?')
    .run(name, sheet_url || null, sheet_id, sheet_tab || 'Sheet1', req.params.id);
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/clients/:id/sync', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'not found' });
  try {
    const summary = await syncClient(client);
    res.json({ ok: true, ...summary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Items ----------
app.get('/api/clients/:clientId/items', (req, res) => {
  const items = db.prepare('SELECT * FROM items WHERE client_id = ? AND deleted = 0 ORDER BY follow_up_date IS NULL, follow_up_date ASC, customer_name').all(req.params.clientId);
  res.json(items);
});

app.post('/api/clients/:clientId/items', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId);
  if (!client) return res.status(404).json({ error: 'client not found' });
  const id = nanoid();
  const fields = ['task','follow_up_date','customer_name','customer_phone','customer_email','debt_amount','invoice_number','balance_due','payment_method','notes'];
  const data = {};
  fields.forEach(f => data[f] = req.body[f] ?? '');
  db.prepare(`INSERT INTO items (id, client_id, task, follow_up_date, customer_name, customer_phone, customer_email, debt_amount, invoice_number, balance_due, payment_method, notes, updated_at)
    VALUES (@id, @client_id, @task, @follow_up_date, @customer_name, @customer_phone, @customer_email, @debt_amount, @invoice_number, @balance_due, @payment_method, @notes, datetime('now'))`)
    .run({ id, client_id: client.id, ...data });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  // try to push immediately to sheet (best-effort)
  try { if (client.sheet_id && google.isAuthorized()) await pushSingleItem(client, item); } catch (e) { /* ignore, will sync later */ }
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
});

app.put('/api/items/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const fields = ['task','follow_up_date','customer_name','customer_phone','customer_email','debt_amount','invoice_number','balance_due','payment_method','notes'];
  const data = {};
  fields.forEach(f => data[f] = req.body[f] ?? existing[f]);
  db.prepare(`UPDATE items SET task=@task, follow_up_date=@follow_up_date, customer_name=@customer_name, customer_phone=@customer_phone,
    customer_email=@customer_email, debt_amount=@debt_amount, invoice_number=@invoice_number, balance_due=@balance_due,
    payment_method=@payment_method, notes=@notes, updated_at=datetime('now') WHERE id=@id`)
    .run({ id: req.params.id, ...data });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(item.client_id);
  try { if (client?.sheet_id && google.isAuthorized()) await pushSingleItem(client, item); } catch (e) {}
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare("UPDATE items SET deleted = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Reminders: items with follow-up date today or earlier ----------
app.get('/api/reminders', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT items.*, clients.name AS client_name FROM items
    JOIN clients ON clients.id = items.client_id
    WHERE items.deleted = 0 AND items.follow_up_date IS NOT NULL AND items.follow_up_date <> '' AND items.follow_up_date <= ?
    ORDER BY items.follow_up_date ASC
  `).all(today);
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`Collection server running on http://localhost:${PORT}`);
});
