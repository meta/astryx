// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file R5-M: a command whose lock another took over while it was stopped
 * puts nothing back and deletes nothing (the other command's files stay),
 * and refuses with ERR_THEME_BUSY.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

// A held lock is busy at once here, so the busy refusal is quick to reach.
vi.mock('../../foundation/release/folder-lock.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    /** @param {string} dir @param {any} fn @param {any} o */
    withFolderLock: (dir, fn, o) =>
      real.withFolderLock(dir, fn, {
        ...o,
        waitMs: /** @type {any} */ (globalThis).__lockWait ?? o.waitMs,
      }),
  };
});

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** When set, the next base lookup (inside the change) takes the lock over. */
const takeover = {armed: false, cwd: ''};

vi.mock('./_project.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    /** @param {any[]} args */
    baseResolved: async (...args) => {
      if (takeover.armed) {
        takeover.armed = false;
        const locks = path.join(
          path.dirname(takeover.cwd),
          'node_modules/.cache/astryx-theme/locks',
        );
        const lock = fs
          .readdirSync(locks)
          .find(n => n.endsWith('-theme-t.lock'));
        if (lock) {
          // Another command takes it, and writes its own undo history.
          fs.writeFileSync(
            path.join(locks, lock, 'owner.json'),
            JSON.stringify({pid: 1, host: 'other', at: Date.now()}),
          );
          fs.writeFileSync(
            path.join(takeover.cwd, 'themes/t/t.history.json'),
            'OTHER',
          );
        }
      }
      return real.baseResolved(...args);
    },
  };
});

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt7-lock-', FIXTURE_PACKAGES);
  takeover.cwd = cwd;
  await themeEditNew('t', {cwd});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a lock taken over during a change', () => {
  it('refuses as busy and leaves the other command’s files alone', async () => {
    takeover.armed = true;
    let code;
    try {
      await themeEditSet('t', 'corners', 'pill', {cwd});
    } catch (e) {
      code = /** @type {any} */ (e).code;
    }
    expect(code).toBe('ERR_THEME_BUSY');
    expect(
      fs.readFileSync(path.join(cwd, 'themes/t/t.history.json'), 'utf8'),
    ).toBe('OTHER');
    expect(
      fs.readFileSync(path.join(cwd, 'themes/t/t.settings.json'), 'utf8'),
    ).not.toContain('pill');
  }, 240_000);
});

describe('a busy lock through the API', () => {
  it("suggests the call's own command, never the host process's arguments", async () => {
    const locks = path.join(
      path.dirname(cwd),
      'node_modules/.cache/astryx-theme/locks',
    );
    const name = fs.readdirSync(locks).find(n => n.endsWith('-theme-t.lock'));
    const lock = path.join(locks, name ?? 'x-theme-t.lock');
    fs.mkdirSync(lock, {recursive: true});
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: 999999, host: 'other', at: Date.now()}),
    );
    /** @type {any} */ (globalThis).__lockWait = 50;
    try {
      let err;
      try {
        await themeEditSet('t', 'corners', 'pill', {cwd, on: 'card'});
      } catch (e) {
        err = /** @type {any} */ (e);
      }
      expect(err?.code).toBe('ERR_THEME_BUSY');
      const names = (err.suggestions ?? []).map(
        (/** @type {any} */ x) => x.name,
      );
      expect(names.join('\n')).toMatch(
        /experimental theme editor set t corners pill --on card$/m,
      );
      expect(names.join('\n')).not.toContain(
        process.argv.slice(2).join(' ') || 'never',
      );
    } finally {
      /** @type {any} */ (globalThis).__lockWait = undefined;
      fs.rmSync(lock, {recursive: true, force: true});
    }
  }, 60_000);
});
