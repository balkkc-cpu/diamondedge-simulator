type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || now > current.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (current.count >= limit) return { allowed: false, remaining: 0 };
  current.count += 1;
  store.set(key, current);
  return { allowed: true, remaining: limit - current.count };
}
