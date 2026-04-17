const BASE = import.meta.env.VITE_API_BASE ?? '';
export const apiUrl = (path) => `${BASE}${path}`;
