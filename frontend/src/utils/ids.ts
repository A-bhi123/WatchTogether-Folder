/** Normalize MongoDB / API ids to comparable strings */
export function normalizeId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj._id != null) return normalizeId(obj._id);
    if (typeof obj.toString === 'function' && obj.toString !== Object.prototype.toString) {
      const s = obj.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return String(value);
}

export function isSameId(a: unknown, b: unknown): boolean {
  const idA = normalizeId(a);
  const idB = normalizeId(b);
  return idA !== '' && idB !== '' && idA === idB;
}
