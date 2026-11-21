const TOKEN_KEY = 'sunucampus.token';

// Frontend-only demo: requests go to an in-browser copy of the API (src/demo) instead of a server.
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';
// Written with the env check inline so normal builds drop the demo code and data entirely.
const demoApi = () => (import.meta.env.VITE_STATIC_DEMO === 'true' ? import('../demo/index.js') : Promise.reject(new Error('Demo API not built')));

/** Sends a request to the in-browser demo API and returns a Response-like { ok, status, data }. */
async function demoRequest(method, path, { query, body, formData } = {}) {
  const { handle } = await demoApi();
  const { status, data } = await handle({ method, path, query: query ?? {}, body, formData, token: localStorage.getItem(TOKEN_KEY) });
  return { ok: status < 400, status, data };
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details ?? [];
  }

  /** Maps validation details to { field: message } for showing errors next to inputs. */
  fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

/** Uploads a file as multipart form data (field name `field`), or sends a prepared `formData`. */
export async function apiUpload(path, file, { field = 'photo', method = 'PUT', formData } = {}) {
  const body = formData ?? new FormData();
  if (!formData) body.append(field, file);
  if (STATIC_DEMO) {
    const r = await demoRequest(method, path, { formData: body });
    if (!r.ok) throw new ApiError(r.status, r.data?.error?.message ?? 'Upload failed', r.data?.error?.details);
    return r.data;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, body, headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Upload failed', data?.error?.details);
  return data;
}

/** Downloads a file from an authenticated endpoint and saves it with the server's filename. */
export async function apiDownload(path, query = {}) {
  if (STATIC_DEMO) {
    const r = await demoRequest('GET', path, { query });
    if (!r.ok) throw new ApiError(r.status, r.data?.error?.message ?? 'Download failed');
    const { downloadText } = await demoApi();
    downloadText(r.data.filename, r.data.content, r.data.type);
    return;
  }
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? 'Download failed');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export async function api(path, { method = 'GET', body, query } = {}) {
  if (STATIC_DEMO) {
    const cleanQuery = Object.fromEntries(Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    // Round-trip through JSON like a real request, so handlers never share objects with the UI.
    const r = await demoRequest(method, path, { query: cleanQuery, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)) });
    const data = r.data == null ? null : JSON.parse(JSON.stringify(r.data));
    if (!r.ok) {
      if (r.status === 401 && localStorage.getItem(TOKEN_KEY)) onUnauthorized();
      throw new ApiError(r.status, data?.error?.message ?? 'Something went wrong', data?.error?.details);
    }
    return data;
  }
  const url = new URL(`/api${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
  }

  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    // A 401 on an authenticated request means the session is no longer valid.
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data?.error?.message ?? 'Something went wrong', data?.error?.details);
  }
  return data;
}
