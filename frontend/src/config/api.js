// Centralized API Base URL helper
// 1. In production on Vercel: uses import.meta.env.VITE_API_URL (e.g. https://mouryasaha-job-tracker-backend.hf.space)
// 2. In local dev: if VITE_API_URL is set in frontend/.env.local it uses that, otherwise defaults to relative '' (which hits the Vite local proxy)
const RAW_API_URL = import.meta.env.VITE_API_URL || '';
export const API_BASE_URL = RAW_API_URL.endsWith('/') ? RAW_API_URL.slice(0, -1) : RAW_API_URL;

export default API_BASE_URL;
