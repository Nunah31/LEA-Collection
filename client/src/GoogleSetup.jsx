import { useState } from 'react';
import { api } from './api';

export default function GoogleSetup({ status, onClose, onChanged }) {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveCreds = async () => {
    setError(''); setBusy(true);
    try {
      const parsed = JSON.parse(jsonText);
      await api.saveGoogleCredentials(parsed);
      await onChanged();
      setJsonText('');
    } catch (e) {
      setError('קובץ JSON לא תקין: ' + e.message);
    } finally { setBusy(false); }
  };

  const connect = async () => {
    setError(''); setBusy(true);
    try {
      const { url } = await api.googleAuthUrl();
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>חיבור ל-Google Sheets</h2>

        {!status.hasCredentials && (
          <div className="step">
            <h3>שלב 1: הגדרת אפליקציית Google (חד פעמי)</h3>
            <ol className="instructions">
              <li>היכנסי ל- <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a> וצרי פרויקט חדש (אם אין לך).</li>
              <li>הפעילי את ה-API בשם <strong>Google Sheets API</strong>.</li>
              <li>צרי פרטי גישה מסוג <strong>OAuth client ID</strong> מסוג "Desktop app" (אם זו הפעם הראשונה תצטרכי גם להגדיר מסך הסכמה - מספיק במצב "Testing" עם המייל שלך כמשתמש בדיקה).</li>
              <li>הוסיפי כתובת הפניה (Redirect URI): <code dir="ltr">http://localhost:4000/api/google/oauth2callback</code></li>
              <li>הורידי את קובץ ה-JSON של פרטי הגישה והדביקי כאן את התוכן שלו:</li>
            </ol>
            <textarea
              dir="ltr"
              rows={6}
              placeholder='{"installed": {"client_id": "...", "client_secret": "...", ...}}'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            <button onClick={saveCreds} disabled={busy || !jsonText.trim()}>שמירת פרטי חיבור</button>
          </div>
        )}

        {status.hasCredentials && (
          <div className="step">
            <h3>שלב 2: התחברות לחשבון Google</h3>
            <p>{status.authorized ? '🟢 כבר מחוברת לחשבון Google. ניתן להתחבר מחדש אם יש בעיה.' : 'לחצי על הכפתור, אשרי גישה לחשבון ה-Google שלך (כולל לקובצי ה-Sheets), ולאחר מכן חזרי לכאן.'}</p>
            <button onClick={connect} disabled={busy}>🔐 {status.authorized ? 'התחברות מחדש' : 'התחברות לחשבון Google'}</button>
            <p className="hint">לאחר האישור בדפדפן, חזרי לכאן ולחצי "רענון מצב".</p>
            <button onClick={onChanged}>🔄 רענון מצב</button>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}
