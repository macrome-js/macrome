import { relative } from 'path';
import recursiveRead from 'recursive-readdir';
import { matcher, Matchable } from './matchable';

export async function traverse(root: string, matchable: Matchable): Promise<Array<string>> {
  const fileMatcher = matcher(matchable);

  // recursiveRead can skip recursing through whole directrories that don't match this way
  const initialPaths = await recursiveRead(root, [(path) => !fileMatcher(relative(root, path))]);

  return initialPaths.map((path) => relative(root, path));
}
