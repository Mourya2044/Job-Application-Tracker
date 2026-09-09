// Centralized API Base URL helper
// 1. In production on Vercel: uses import.meta.env.VITE_API_URL (e.g. https://mouryasaha-job-tracker-backend.hf.space)
// 2. In local dev: if VITE_API_URL is set in frontend/.env.local it uses that, otherwise defaults to relative '' (which hits the Vite local proxy)
const RAW_API_URL = (import.meta.env.VITE_API_URL || '').trim();
export const API_BASE_URL = RAW_API_URL.replace(/\/+$/, '');

/**
 * Returns a fully-qualified URL with any double slashes stripped
 */
export function apiUrl(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * Robust JSON fetch helper that handles HTML error pages (e.g. 503 during restarts)
 * without throwing "Unexpected token < in JSON at position 0"
 */
export async function fetchApi(endpoint, options = {}) {
  const url = apiUrl(endpoint);
  const res = await fetch(url, options);

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;
    if (isJson) {
      try {
        const errorData = await res.json();
        errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
      } catch {}
    } else {
      // It was an HTML error page (e.g. 503 Service Unavailable during container restart)
      errorMessage = `Server response error (${res.status}). Please retry in a few moments.`;
    }
    const err = new Error(errorMessage);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return null;
  }

  if (isJson) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  return await res.text();
}

export default API_BASE_URL;

