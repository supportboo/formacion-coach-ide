// ponytail: ventana deslizante en memoria de proceso — sube a Redis si se corre en >1 instancia.
const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const w = hits.get(key);
  if (!w || now - w.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return false;
  }
  w.count++;
  return w.count > max;
}
