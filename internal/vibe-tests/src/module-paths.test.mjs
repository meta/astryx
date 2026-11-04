// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file module-paths.test.mjs
 * @input Uses vitest, node:fs, node:path, node:url, this package's source layout
 * @output Guard that module directories come from decoded file paths, not URI paths
 * @position Testing; build-previews.ts derived its __dirname from
 *   `new URL(import.meta.url).pathname`, so every checkout whose path contains a
 *   character a file URL percent-encodes — a space, `"`, `#`, `%`, `<`, `>`, `?`,
 *   `[`, `]`, `^`, a backtick, `{`, `|`, `}`, `~`, or any non-ASCII name — resolved
 *   VIBE_DIR/REPO_ROOT to a directory that does not exist. `&`, `+`, `!`, `$`,
 *   `'`, `(`, `)`, `*`, `,`, `-`, `:`, `;`, `=`, `@` and `_` pass through untouched,
 *   so a checkout named with one of those already worked. Both lists are measured
 *   against `pathToFileURL(...).pathname`, not guessed
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, it, expect, afterEach} from 'vitest';

// `import.meta.url` is a URL. Its `pathname` is the *URI* path, which
// percent-encodes reserved characters — it is not a filesystem path, so
// `path.dirname` of it yields a location that exists only in escaped form.
const URI_PATH_AS_DIRECTORY = /new URL\(import\.meta\.url\)\.pathname/;

const SRC_DIR = import.meta.dirname;
const GUARDED_DIRS = [SRC_DIR, path.join(SRC_DIR, '..', 'scripts')];

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function sourceModules(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter(
      name =>
        /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name),
    )
    .map(name => path.join(dir, name));
}

describe('module directory derivation', () => {
  it('never reads a directory out of a URI pathname', () => {
    const offenders = [];
    for (const dir of GUARDED_DIRS) {
      for (const file of sourceModules(dir)) {
        const lines = fs
          .readFileSync(file, 'utf-8')
          .split('\n')
          .map((text, index) => ({text, index: index + 1}))
          .filter(({text}) => URI_PATH_AS_DIRECTORY.test(text));
        for (const {text, index} of lines) {
          offenders.push(
            `${path.relative(path.join(SRC_DIR, '../..'), file)}:${index} ${text.trim()}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('resolves a real directory for a path that percent-encodes, and a fake one for its URI form', () => {
    // A checkout under "GitHub Projects/" or a non-ASCII home directory is the
    // whole trigger; the temp name below is that trigger in miniature.
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vibe path probe-')),
    );
    tempDirs.push(dir);
    const moduleFile = path.join(dir, 'build-previews.ts');
    fs.writeFileSync(moduleFile, 'export {};');

    const url = pathToFileURL(moduleFile).href;
    const decoded = path.dirname(fileURLToPath(url));
    const escaped = path.dirname(new URL(url).pathname);

    // The idiom the fix uses round-trips; the idiom the bug used does not.
    expect(decoded).toBe(dir);
    expect(escaped).not.toBe(dir);
    expect(escaped).toContain('%20');

    // Not a cosmetic difference: one directory exists and the other does not,
    // so every VIBE_DIR/REPO_ROOT derived from it points at nothing.
    expect(fs.existsSync(decoded)).toBe(true);
    expect(fs.existsSync(escaped)).toBe(false);
    expect(() => fs.readdirSync(escaped)).toThrow(/ENOENT/);
    expect(() => fs.readdirSync(escaped)).toThrow(/%20/);
  });

  it('reaches the repo root this package actually needs from a decoded path', () => {
    // The two REPO_ROOT derivations a build cannot do without: the
    // `packages/core/src/tailwind-theme.css` import injected into every
    // generated preview entry, and the `rootDir` written into the generated
    // tsconfig. Both are resolved from the module directory, so a URI-escaped
    // one points the import and the compiler at nothing.
    const vibeDir = path.resolve(SRC_DIR, '..');
    const repoRoot = path.resolve(vibeDir, '../..');
    expect(
      fs.existsSync(
        path.join(repoRoot, 'packages/core/src/tailwind-theme.css'),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(vibeDir, 'tsconfig.astryx.json'))).toBe(
      true,
    );
  });
});
