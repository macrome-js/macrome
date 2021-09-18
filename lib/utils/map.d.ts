export declare function groupBy<K, V>(getKey: (value: V) => K, iterable: Iterable<V>): Map<K, Array<V>>;
export declare function get<K, V>(map: Map<K, V>, key: K, whenNotHas: V): V;
