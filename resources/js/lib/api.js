const BASE = '/api/v1';

let token = null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('lb_token', t);
  else localStorage.removeItem('lb_token');
}

export function getToken() {
  if (!token) token = localStorage.getItem('lb_token');
  return token;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    throw new Error('Session expired — reloading');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  guest: (name) => request('/auth/guest', { method: 'POST', body: name ? { name } : {} }),
  me: () => request('/me'),
  createRoom: (name) => request('/rooms', { method: 'POST', body: { name } }),
  joinRoom: (code) => request('/rooms/join', { method: 'POST', body: { code } }),
  room: (code) => request(`/rooms/${code}`),
  snapshot: (code) => request(`/rooms/${code}/snapshot`),
  export: (code) => request(`/rooms/${code}/export`, { method: 'POST' }),
};
