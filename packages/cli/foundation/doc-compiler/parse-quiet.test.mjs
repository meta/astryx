// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A doc's parse prints nothing: it returns the parsed doc or throws.
 * The CLI keeps the parse of a doc it reads from its stored docs
 * (./stored-docs.mjs keptParse), and a run that reads a kept parse does not
 * parse, so a parse that printed a warning would lose it on that run. Every
 * doc the CLI and Core ship is parsed here while the test watches the
 * console and both output streams.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseReadableDoc} from './parse-readable.mjs';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const ROOTS = [
  path.join(CLI_ROOT, 'assets', 'docs'),
  path.join(CLI_ROOT, '..', 'core', 'src'),
];

/**
 * Every `.doc.mjs` file under `dir`.
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
function docFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') docFiles(file, out);
    } else if (entry.name.endsWith('.doc.mjs')) {
      out.push(file);
    }
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a doc parse', () => {
  it('prints nothing, for every doc the CLI and Core ship', async () => {
    const watched = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
      vi.spyOn(process.stdout, 'write'),
      vi.spyOn(process.stderr, 'write'),
    ];
    let parsed = 0;
    for (const file of ROOTS.flatMap(root => docFiles(root))) {
      const mod = await import(pathToFileURL(file).href);
      for (const value of Object.values(mod)) {
        if (!value || typeof value !== 'object') continue;
        try {
          parseReadableDoc(value, file);
        } catch {
          // A parse that fails throws, which a kept parse never replays.
        }
        parsed++;
      }
    }
    expect(parsed).toBeGreaterThan(100);
    for (const spy of watched) expect(spy).not.toHaveBeenCalled();
  });
});
