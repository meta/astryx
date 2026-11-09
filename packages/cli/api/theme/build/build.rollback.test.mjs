// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `theme build` writes its CSS, JS, and declarations as one transaction: when
 * a later output fails to publish, every output it already replaced gets its
 * previous bytes back and every output it created is removed. Publishing is
 * forced to fail by wrapping the two calls that publish a staged file:
 * `linkSync` for a new file and `renameSync` for a replacement.
 *
 * Separate file because vi.mock is hoisted and affects the whole module.
 * `themeBuild` needs a built core; the `node` project's globalSetup builds it.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

const failures = vi.hoisted(() => ({
  /** Fail the Nth staged-file publish (1-based); 0 disables. */
  publish: 0,
  count: 0,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = /** @type {typeof import('node:fs')} */ (
    await importOriginal()
  );
  /** @param {string} source @param {string} op */
  const maybeFail = (source, op) => {
    if (!path.basename(String(source)).includes('.tmp')) return;
    if (failures.publish === 0) return;
    failures.count++;
    if (failures.count === failures.publish) {
      throw Object.assign(new Error(`EIO: forced ${op} failure`), {
        code: 'EIO',
      });
    }
  };
  return {
    ...actual,
    linkSync: vi.fn((source, destination) => {
      maybeFail(source, 'link');
      return actual.linkSync(source, destination);
    }),
    renameSync: vi.fn((source, destination) => {
      maybeFail(source, 'rename');
      return actual.renameSync(source, destination);
    }),
  };
});

const fs = await import('node:fs');
const {themeBuild} = await import('./build.mjs');

vi.setConfig({testTimeout: 30000});

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-theme-build-rollback-'),
  );
  failures.publish = 0;
  failures.count = 0;
});

afterEach(() => {
  failures.publish = 0;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Write a source for the theme named `rollbacktheme`. Each call uses a new
 * file so the loader cannot serve an earlier version from its cache.
 * @param {string} file @param {string} background
 */
function writeTheme(file, background) {
  fs.writeFileSync(
    path.join(tmpDir, file),
    `export default { name: 'rollbacktheme', tokens: { '--color-bg': '${background}' } };\n`,
  );
  return file;
}

const OUTPUTS = ['rollbacktheme.css', 'rollbacktheme.js', 'rollbacktheme.d.ts'];

/** @returns {Map<string, Buffer | null>} */
function readOutputs() {
  return new Map(
    OUTPUTS.map(name => {
      const file = path.join(tmpDir, name);
      return [name, fs.existsSync(file) ? fs.readFileSync(file) : null];
    }),
  );
}

function strays() {
  return fs
    .readdirSync(tmpDir)
    .filter(name => name.includes('.tmp') || name.includes('.restore-'));
}

describe('themeBuild rolls back a partial write', () => {
  it('removes every created output when the second publish fails', async () => {
    const source = writeTheme('first.mjs', '#0a0a0a');
    failures.publish = 2;

    await expect(themeBuild(source, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
    });

    for (const bytes of readOutputs().values()) expect(bytes).toBeNull();
    expect(strays()).toEqual([]);
  });

  it('restores every replaced output when the second publish fails', async () => {
    const first = await themeBuild(
      writeTheme('first.mjs', '#0a0a0a'),
      {},
      {cwd: tmpDir},
    );
    expect(first?.type).toBe('theme.build');
    const before = readOutputs();
    for (const bytes of before.values()) expect(bytes).not.toBeNull();

    const next = writeTheme('next.mjs', '#fafafa');
    failures.publish = 2;
    await expect(themeBuild(next, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
    });

    const after = readOutputs();
    for (const name of OUTPUTS) {
      expect(
        after.get(name)?.equals(/** @type {Buffer} */ (before.get(name))),
      ).toBe(true);
    }

    // The failed build really had different bytes to write.
    failures.publish = 0;
    await themeBuild(next, {}, {cwd: tmpDir});
    const css = readOutputs().get('rollbacktheme.css');
    expect(
      css?.equals(/** @type {Buffer} */ (before.get('rollbacktheme.css'))),
    ).toBe(false);
    expect(strays()).toEqual([]);
  });
});
