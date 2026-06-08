import db from './db.js';
import { getSheetsClient } from './google.js';
import { nanoid } from 'nanoid';

// Column order matches the original "קומפון גבייה" template
export const COLUMNS = [
  { key: 'task', header: 'משימה' },
  { key: 'follow_up_date', header: 'תאריך מעקב' },
  { key: 'customer_name', header: 'שם לקוח' },
  { key: 'customer_phone', header: 'נייד לקוח' },
  { key: 'customer_email', header: 'כתובת מייל' },
  { key: 'debt_amount', header: 'סכום החוב' },
  { key: 'invoice_number', header: "מס' חשבונית" },
  { key: 'balance_due', header: 'יתרה לתשלום נכון ליום' },
  { key: 'payment_method', header: 'אמצעי תשלום' },
  { key: 'notes', header: 'הערות / שליחת הודעה/שליחת מייל' },
];

const RANGE_FOR = (tab) => `${tab}!A1:J`;

function rowToItem(row) {
  const obj = {};
  COLUMNS.forEach((c, i) => { obj[c.key] = row[i] ?? ''; });
  return obj;
}

function itemToRow(item) {
  return COLUMNS.map((c) => item[c.key] ?? '');
}

function rowsEqual(a, b) {
  return COLUMNS.every((c) => (a[c.key] ?? '') === (b[c.key] ?? ''));
}

// Pulls sheet -> DB, then pushes DB-only new items -> sheet. Returns summary.
export async function syncClient(client) {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error('Google not authorized');
  if (!client.sheet_id) throw new Error('Client has no linked sheet');

  const tab = client.sheet_tab || 'Sheet1';
  const range = RANGE_FOR(tab);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: client.sheet_id, range });
  const values = res.data.values || [];
  const dataRows = values.slice(1); // skip header

  const existing = db.prepare('SELECT * FROM items WHERE client_id = ? AND deleted = 0').all(client.id);
  const bySheetRow = new Map(existing.filter(i => i.sheet_row != null).map(i => [i.sheet_row, i]));

  let pulled = 0, updated = 0, pushedNew = 0, pushedUpdates = 0;
  const seenSheetRows = new Set();

  // 1. Pull: sheet rows -> DB (sheet is source of truth for existing rows unless local changed more recently... we use last-write heuristic: if local row updated after last sync timestamp, push instead of overwrite)
  const lastSync = getLastSync(client.id);

  for (let i = 0; i < dataRows.length; i++) {
    const sheetRowNum = i + 2; // +1 header, +1 1-indexed
    const row = dataRows[i];
    if (row.every((v) => !v || String(v).trim() === '')) continue;
    seenSheetRows.add(sheetRowNum);
    const sheetItem = rowToItem(row);
    const local = bySheetRow.get(sheetRowNum);

    if (!local) {
      // New row from sheet -> insert into DB
      const id = nanoid();
      db.prepare(`INSERT INTO items (id, client_id, task, follow_up_date, customer_name, customer_phone, customer_email, debt_amount, invoice_number, balance_due, payment_method, notes, sheet_row, updated_at)
        VALUES (@id, @client_id, @task, @follow_up_date, @customer_name, @customer_phone, @customer_email, @debt_amount, @invoice_number, @balance_due, @payment_method, @notes, @sheet_row, datetime('now'))`)
        .run({ id, client_id: client.id, sheet_row: sheetRowNum, ...sheetItem });
      pulled++;
    } else {
      const localChangedSinceSync = !lastSync || (local.updated_at && local.updated_at > lastSync);
      if (rowsEqual(local, sheetItem)) {
        // no diff
      } else if (localChangedSinceSync) {
        // local wins -> will push below
      } else {
        // sheet wins -> update DB
        db.prepare(`UPDATE items SET task=@task, follow_up_date=@follow_up_date, customer_name=@customer_name, customer_phone=@customer_phone,
          customer_email=@customer_email, debt_amount=@debt_amount, invoice_number=@invoice_number, balance_due=@balance_due,
          payment_method=@payment_method, notes=@notes, updated_at=datetime('now') WHERE id=@id`)
          .run({ id: local.id, ...sheetItem });
        updated++;
      }
    }
  }

  // 2. Push: local items with no sheet_row (new in app), or local-wins conflicts -> write to sheet
  const refreshed = db.prepare('SELECT * FROM items WHERE client_id = ? AND deleted = 0').all(client.id);
  const toAppend = refreshed.filter((it) => it.sheet_row == null);
  const toUpdateInSheet = refreshed.filter((it) => {
    if (it.sheet_row == null) return false;
    const idx = it.sheet_row - 2;
    const sheetRow = dataRows[idx];
    if (!sheetRow) return true; // row missing in sheet -> rewrite
    const sheetItem = rowToItem(sheetRow);
    const localChangedSinceSync = !lastSync || (it.updated_at && it.updated_at > lastSync);
    return localChangedSinceSync && !rowsEqual(it, sheetItem);
  });

  if (toUpdateInSheet.length) {
    const data = toUpdateInSheet.map((it) => ({
      range: `${tab}!A${it.sheet_row}:J${it.sheet_row}`,
      values: [itemToRow(it)],
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.sheet_id,
      requestBody: { valueInputOption: 'RAW', data },
    });
    pushedUpdates += toUpdateInSheet.length;
  }

  if (toAppend.length) {
    const startRow = values.length + 1; // append after last existing row
    const appendValues = toAppend.map(itemToRow);
    await sheets.spreadsheets.values.append({
      spreadsheetId: client.sheet_id,
      range: RANGE_FOR(tab),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appendValues },
    });
    toAppend.forEach((it, idx) => {
      db.prepare('UPDATE items SET sheet_row = ? WHERE id = ?').run(startRow + idx, it.id);
    });
    pushedNew += toAppend.length;
  }

  setLastSync(client.id);

  return { pulled, updated, pushedNew, pushedUpdates, total: dataRows.length };
}

export async function pushSingleItem(client, item) {
  const sheets = getSheetsClient();
  if (!sheets || !client.sheet_id) return;
  const tab = client.sheet_tab || 'Sheet1';
  if (item.sheet_row) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: client.sheet_id,
      range: `${tab}!A${item.sheet_row}:J${item.sheet_row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [itemToRow(item)] },
    });
  } else {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: client.sheet_id, range: RANGE_FOR(tab) });
    const startRow = (res.data.values || []).length + 1;
    await sheets.spreadsheets.values.append({
      spreadsheetId: client.sheet_id,
      range: RANGE_FOR(tab),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [itemToRow(item)] },
    });
    db.prepare('UPDATE items SET sheet_row = ? WHERE id = ?').run(startRow, item.id);
  }
}

function getLastSync(clientId) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`last_sync_${clientId}`);
  return row ? row.value : null;
}
function setLastSync(clientId) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = datetime(\'now\')')
    .run(`last_sync_${clientId}`);
}
