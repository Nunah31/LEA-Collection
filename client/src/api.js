const BASE = '/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'שגיאה');
  }
  return res.json();
}

export const api = {
  googleStatus: () => req('/google/status'),
  saveGoogleCredentials: (json) => req('/google/credentials', { method: 'POST', body: JSON.stringify(json) }),
  googleAuthUrl: () => req('/google/auth-url'),

  getClients: () => req('/clients'),
  createClient: (data) => req('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => req(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id) => req(`/clients/${id}`, { method: 'DELETE' }),
  syncClient: (id) => req(`/clients/${id}/sync`, { method: 'POST' }),

  getItems: (clientId) => req(`/clients/${clientId}/items`),
  createItem: (clientId, data) => req(`/clients/${clientId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id, data) => req(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id) => req(`/items/${id}`, { method: 'DELETE' }),

  getReminders: () => req('/reminders'),
};
