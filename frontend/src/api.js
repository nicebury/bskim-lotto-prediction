const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
  dashboard: () => request('/dashboard'),
  startCrawl: () => request('/crawl', { method: 'POST' }),
  crawlStatus: () => request('/crawl/status'),
  results: (page = 1, pageSize = 20) =>
    request(`/results?page=${page}&page_size=${pageSize}`),
  resultByRound: (round) => request(`/results/${round}`),
  predict: ({ sets = 5, simulations = 50000, hotRounds = 20, seed } = {}) => {
    const q = new URLSearchParams({
      sets: String(sets),
      simulations: String(simulations),
      hot_rounds: String(hotRounds),
    });
    if (seed != null) q.set('seed', String(seed));
    return request(`/predict?${q.toString()}`, { method: 'POST' });
  },
  strategies: ({ sets = 1, seed } = {}) => {
    const q = new URLSearchParams({ sets: String(sets) });
    if (seed != null) q.set('seed', String(seed));
    return request(`/predict/strategies?${q.toString()}`, { method: 'POST' });
  },
  dreamAnalyze: (text) =>
    request('/dream/analyze', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  dreamLotto: ({ selected, setsPerTier = 10, seed }) =>
    request('/dream/lotto', {
      method: 'POST',
      body: JSON.stringify({
        selected,
        sets_per_tier: setsPerTier,
        ...(seed != null ? { seed } : {}),
      }),
    }),
};
