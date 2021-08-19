import { ReadOptions } from '../types';

export function buildReadOptions(options?: ReadOptions): {
  encoding: BufferEncoding;
  flags?: string;
} {
  const options_ = typeof options === 'string' ? { encoding: options } : options || {};

  return { ...options_, encoding: options_.encoding || 'utf8' };
}
