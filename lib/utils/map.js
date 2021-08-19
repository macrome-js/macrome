"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupBy = void 0;
function groupBy(getKey, iterable) {
    const grouped = new Map();
    for (const value of iterable) {
        const key = getKey(value);
        if (!grouped.has(key))
            grouped.set(key, []);
        grouped.get(key).push(value);
    }
    return grouped;
}
exports.groupBy = groupBy;
