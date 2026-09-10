interface RateLimitRecord {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const records = new Map<string, RateLimitRecord>();

export function checkRateLimit(identifier: string, now = Date.now()): boolean {
  const key = identifier || "anonymous";
  const current = records.get(key) ?? { timestamps: [] };
  current.timestamps = current.timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (current.timestamps.length >= MAX_REQUESTS) {
    records.set(key, current);
    return false;
  }

  current.timestamps.push(now);
  records.set(key, current);
  return true;
}

export function resetRateLimit(): void {
  records.clear();
}
