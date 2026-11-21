// Recent searches stay on this device only.
const KEY = 'sunucampus.recentSearches';

export function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveRecent(term) {
  const lower = term.toLowerCase();
  // Drop earlier, shorter versions of the same search ("fa", "fat" when "fatou" is saved).
  const next = [term, ...readRecent().filter((t) => !lower.startsWith(t.toLowerCase()))].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeRecent(term) {
  const next = readRecent().filter((t) => t !== term);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearRecent() {
  localStorage.removeItem(KEY);
  return [];
}
