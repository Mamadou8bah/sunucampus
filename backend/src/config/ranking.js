const defaults = {
  feed: { relationship: 0.25, interest: 0.20, engagement: 0.20, recency: 0.15, community: 0.15, discovery: 0.05 },
  people: { mutual: 0.30, interests: 0.25, courses: 0.15, programme: 0.10, communities: 0.10, year: 0.05, activity: 0.05 },
  recencyHours: 24,
  discoveryShare: 0.20,
};

function config() {
  const overrides = JSON.parse(process.env.RANKING_CONFIG || '{}');
  const result = { ...defaults, ...overrides };
  for (const group of ['feed', 'people']) {
    result[group] = { ...defaults[group], ...overrides[group] };
    for (const [key, value] of Object.entries(result[group])) {
      if (!(key in defaults[group]) || !Number.isFinite(value) || value < 0) throw new Error('Invalid ranking weight: ' + group + '.' + key);
    }
    if (!Object.values(result[group]).some((value) => value > 0)) throw new Error('At least one ranking weight must be positive: ' + group);
  }
  if (!Number.isFinite(result.recencyHours) || result.recencyHours <= 0
    || !Number.isFinite(result.discoveryShare) || result.discoveryShare < 0 || result.discoveryShare > 1) {
    throw new Error('Invalid ranking decay or discovery share');
  }
  return result;
}

export const rankingConfig = config();
