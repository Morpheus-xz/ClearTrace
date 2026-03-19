const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
}

export const api = {
  API_BASE_URL,
  getHealth: () => request('/health'),
  getGraphData: () => request('/graph-data'),
  getFraudRings: () => request('/fraud-rings'),
  analyzeClaim: (payload) =>
    request('/analyze-claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
