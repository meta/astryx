// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file entrypoint-guard.test.mjs
 * @input Uses vitest, node:child_process, node:fs, node:os, node:path, node:url,
 *   this repository's tracked source files
 * @output Guard that a script decides "am I the entrypoint?" by comparing two
 *   file URLs, never by prefixing `process.argv[1]` with `file://`
 * @position Tooling; `process.argv[1]` is a filesystem path and
 *   `import.meta.url` is a percent-encoded URL, so the concatenation only matches
 *   in a checkout whose whole path uses characters a URL leaves alone. Anywhere
 *   else the guarded block is dead: the script runs, prints nothing and exits 0.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, it, expect, afterEach} from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * `import.meta.url === \`file://${process.argv[1]}\`` and its string-concatenation
 * twin. Written as a pattern over source text, never used as a guard: a scan needs
 * the broken comparison somewhere as data, and `trackedSources()` skips every test
 * file — this one included.
 */
const NAIVE_ENTRYPOINT_GUARD =
  /import\.meta\.url\s*===\s*(?:`file:\/\/\$\{process\.argv\[1\]\}`|'file:\/\/'\s*\+\s*process\.argv\[1\])/;

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/**
 * Tracked runnable sources, excluding test files. A guard lives in a `.ts`
 * entrypoint as readily as in an `.mjs` one — `internal/vibe-tests/setup-test/`
 * has both — so the scan covers every extension a command runs from.
 */
function trackedSources() {
  const listing = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return listing
    .split('\0')
    .filter(Boolean)
    .filter(file => /\.[mc]?[jt]s$/.test(file))
    .filter(file => !/\.test\.[mc]?[jt]s$/.test(file))
    .filter(file => fs.existsSync(path.join(REPO_ROOT, file)));
}

describe('entrypoint guard', () => {
  it('never builds a file URL by appending the argv path to a prefix', () => {
    const offenders = [];
    for (const file of trackedSources()) {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const lines = source.split('\n');
      for (let index = 0; index < lines.length; index++) {
        if (NAIVE_ENTRYPOINT_GUARD.test(lines[index])) {
          offenders.push(`${file}:${index + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('fires the URL-to-URL comparison where the concatenation does not', () => {
    // The trigger is a checkout path containing a character a file URL
    // percent-encodes. A temp directory supplies it whatever the machine
    // holding this checkout is called.
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'entrypoint guard-')),
    );
    tempDirs.push(dir);
    const moduleFile = path.join(dir, 'cli.mjs');
    fs.writeFileSync(
      moduleFile,
      [
        "import {pathToFileURL} from 'node:url';",
        'const concatenation =',
        "  import.meta.url === 'file://' + process.argv[1];",
        'const urlComparison =',
        '  process.argv[1] &&',
        '  import.meta.url === pathToFileURL(process.argv[1]).href;',
        'process.stdout.write(JSON.stringify({concatenation, urlComparison}));',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [moduleFile], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      concatenation: false,
      urlComparison: true,
    });
  });
});
