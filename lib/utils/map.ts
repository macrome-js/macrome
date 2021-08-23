export function groupBy<K, V>(getKey: (value: V) => K, iterable: Iterable<V>): Map<K, Array<V>> {
  const grouped = new Map();
  for (const value of iterable) {
    const key = getKey(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

export function get(map: Map<K, V>, key: K, whenNotHas: V): V {
  return map.has(key) ? map.get(key) : whenNotHas;
}
