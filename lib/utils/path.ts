export const printRelative = (path: string) => (path.startsWith('.') ? path : `./${path}`);
