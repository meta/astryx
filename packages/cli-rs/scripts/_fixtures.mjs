// The conformance fixtures the oracle scripts read: materialized by the
// conformance setup (its folder is named by a hash of what builds it).
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const NAMES = ['app', 'author', 'brokencore', 'empty', 'inputs', 'integration', 'large', 'nocore', 'plain'];

export async function fixtureDirs() {
  const setupFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '../conformance/setup.mjs');
  const s = await import(pathToFileURL(setupFile).href);
  await s.setup();
  return NAMES.map(name => ({name, dir: path.join(s.FIXTURES, name)}));
}
