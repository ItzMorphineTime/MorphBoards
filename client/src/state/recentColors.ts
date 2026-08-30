import { create } from 'zustand';

const STORAGE_KEY = 'morphboards.recentColors';
const LIMIT = 8;

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === 'string');
  } catch {
    // ignore storage failures
  }
  return [];
}

interface RecentColors {
  colors: string[];
  add(color: string): void;
}

/** Custom colors picked recently, shared by every color field, persisted locally. */
export const useRecentColors = create<RecentColors>()((set) => ({
  colors: load(),
  add: (color) =>
    set((s) => {
      const colors = [color, ...s.colors.filter((c) => c !== color)].slice(0, LIMIT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
      } catch {
        // ignore storage failures
      }
      return { colors };
    }),
}));
