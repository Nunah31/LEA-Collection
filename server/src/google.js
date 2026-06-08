import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_PATH = path.join(__dirname, '..', 'data', 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'data', 'google-token.json');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const REDIRECT_URI = 'http://localhost:4000/api/google/oauth2callback';

let oAuth2Client = null;

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8'));
  const creds = raw.installed || raw.web;
  return creds;
}

export function hasCredentials() {
  return fs.existsSync(CRED_PATH);
}

export function isAuthorized() {
  return fs.existsSync(TOKEN_PATH);
}

export function getAuthClient() {
  if (oAuth2Client) return oAuth2Client;
  const creds = loadCredentials();
  if (!creds) return null;
  oAuth2Client = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT_URI);
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);
  }
  oAuth2Client.on('tokens', (tokens) => {
    const existing = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) : {};
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
  return oAuth2Client;
}

export function getAuthUrl() {
  const client = getAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

export async function handleOAuthCallback(code) {
  const client = getAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return true;
}

export function saveCredentialsFile(jsonContent) {
  fs.writeFileSync(CRED_PATH, JSON.stringify(jsonContent, null, 2));
  oAuth2Client = null;
}

export function getSheetsClient() {
  const client = getAuthClient();
  if (!client) return null;
  return google.sheets({ version: 'v4', auth: client });
}

// Extract spreadsheet ID from a full Google Sheets URL or raw ID
export function extractSheetId(input) {
  if (!input) return null;
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input.trim())) return input.trim();
  return null;
}
