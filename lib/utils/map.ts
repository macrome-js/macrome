export function groupBy<K, V>(getKey: (value: V) => K, iterable: Iterable<V>): Map<K, Array<V>> {
  const grouped = new Map();
  for (const value of iterable) {
    const key = getKey(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}
