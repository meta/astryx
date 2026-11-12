// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixth pass over `astryx experimental theme editor`: a leased
 * lock is not taken over on a process id alone, one recovery for a folder
 * that lost its settings or was left by a stopped `new` (keeping the user's
 * own files), dead temp files swept at once, `show` without React writing
 * nothing, and demo images that open from disk.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {tryLock} from '../../foundation/release/cache.mjs';
import {LEASE_RENEW_MS} from '../../foundation/release/lock-lease.mjs';
import {refuseWithoutReact, renderGenerated} from './_parts.mjs';
import {previewRecordProblem} from './_preview-app.mjs';
import {
  SILENT_MS,
  stillHolds,
  withFolderLock,
} from '../../foundation/release/folder-lock.mjs';
import {openProject} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt6-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('T1: a leased lock and a process id that looks gone', () => {
  it('keeps a fresh lease, and takes over one that stood unrenewed', () => {
    const dir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lease-')),
      'x.lock',
    );
    fs.mkdirSync(dir);
    const owner = path.join(dir, 'owner.json');
    // The same computer name, a process this run cannot see (another
    // process space): it looks gone.
    fs.writeFileSync(
      owner,
      JSON.stringify({
        pid: 999999,
        host: os.hostname(),
        at: Date.now(),
        ns: 'pid:[1]',
      }),
    );
    expect(tryLock(dir, {leased: true})).toBe(false);
    const old = new Date(Date.now() - 4 * LEASE_RENEW_MS);
    fs.utimesSync(owner, old, old);
    expect(tryLock(dir, {leased: true})).toBe(true);
  });

  it('takes over at once a lock from this process space whose process is gone', () => {
    const dir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lease-')),
      'x.lock',
    );
    expect(tryLock(dir, {leased: true})).toBe(true);
    const owner = path.join(dir, 'owner.json');
    const record = JSON.parse(fs.readFileSync(owner, 'utf8'));
    fs.writeFileSync(owner, JSON.stringify({...record, pid: 999999}));
    // Without a process space to compare (not Linux), the id is judged as is.
    expect(tryLock(dir, {leased: true})).toBe(true);
  });
});

describe('recovery', () => {
  it('N6: a folder that lost its settings is made again by new, keeping the user files and the history', async () => {
    await themeEditNew('n6', {cwd});
    await themeEditSet('n6', 'corners', 'pill', {cwd});
    await themeEditSet('n6', 'spacing', 'roomy', {cwd});
    const dir = path.join(cwd, 'themes/n6');
    fs.writeFileSync(path.join(dir, 'NOTES.md'), '# notes');
    fs.rmSync(path.join(dir, 'n6.settings.json'));
    const r = await refusal(() => themeEditUndo('n6', {cwd}));
    expect(r.code).toBe('ERR_UNKNOWN_THEME');
    expect(r.run).toEqual([expect.stringMatching(/ new n6$/)]);
    const made = await themeEditNew('n6', {cwd});
    expect(made.data.notes.join(' ')).toContain('NOTES.md');
    expect(fs.readFileSync(path.join(dir, 'NOTES.md'), 'utf8')).toBe('# notes');
    // The step back returns the settings before the last change.
    await themeEditUndo('n6', {cwd});
    const settings = JSON.parse(
      fs.readFileSync(path.join(dir, 'n6.settings.json'), 'utf8'),
    ).settings;
    expect(settings.map((/** @type {any} */ s) => s.thing)).toEqual([
      'corners',
    ]);
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);

  it('F3: after a stopped new, extra files do not block new, and are kept', async () => {
    const dir = path.join(cwd, 'themes/f3');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '.astryx-new.json'), '{}');
    fs.writeFileSync(path.join(dir, 'f3.css'), '/* half */');
    fs.writeFileSync(path.join(dir, 'NOTES.md'), '# notes');
    const r = await refusal(() => themeEditShow('f3', {cwd}));
    expect(r.run).toEqual([expect.stringMatching(/ new f3$/)]);
    await themeEditNew('f3', {cwd});
    expect(fs.readFileSync(path.join(dir, 'NOTES.md'), 'utf8')).toBe('# notes');
    expect(fs.existsSync(path.join(dir, 'f3.settings.json'))).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);

  it('F3: a source saved by hand after a stopped new is kept, not replaced', async () => {
    const dir = path.join(cwd, 'themes/f3b');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '.astryx-new.json'), '{}');
    const own = `import {f3bSettings} from './f3b.settings';\nimport {defineTheme} from '@astryxdesign/core/theme';\n\nexport const f3bTheme = defineTheme({\n  extends: f3bSettings,\n  name: 'f3b',\n});\n// mine\n`;
    fs.writeFileSync(path.join(dir, 'f3b.theme.ts'), own);
    await themeEditNew('f3b', {cwd}).catch(() => undefined);
    expect(fs.readFileSync(path.join(dir, 'f3b.theme.ts'), 'utf8')).toBe(own);
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);
});

describe('T11', () => {
  it('a temp file of a process that is gone is removed at the next write', async () => {
    await themeEditNew('tt', {cwd});
    const left = path.join(
      cwd,
      'themes/tt/.tt.settings.json.astryx-999999-abc123.tmp',
    );
    fs.writeFileSync(left, '{');
    await themeEditSet('tt', 'corners', 'small', {cwd});
    expect(fs.existsSync(left)).toBe(false);
    fs.rmSync(path.join(cwd, 'themes/tt'), {recursive: true, force: true});
  }, 240_000);
});

describe('renders', () => {
  it('without React, show is refused before anything is written', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'no-react-'));
    fs.writeFileSync(path.join(bare, 'package.json'), '{}');
    let code;
    try {
      refuseWithoutReact(bare);
    } catch (e) {
      code = /** @type {any} */ (e).code;
    }
    expect(code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    fs.rmSync(bare, {recursive: true, force: true});
  });

  it('demo images open from disk: no link to the docs site folder', async () => {
    const project = await openProject(cwd);
    const page = await renderGenerated(
      project,
      'demo.tsx',
      `export default function Demo() {\n  return <img alt="" src="/template-assets/photo.jpg" />;\n}\n`,
    );
    expect(page.html).not.toContain('/template-assets/');
    expect(page.html).toContain('data:image/svg+xml');
  }, 240_000);
});

describe('chaos round 4', () => {
  it('NEW-H: a holder that lost its lock while stopped writes nothing more', async () => {
    const dir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fence-')),
      'x.lock',
    );
    let code;
    await withFolderLock(
      dir,
      async () => {
        stillHolds();
        // Another command took the lock over while this one was stopped.
        fs.writeFileSync(
          path.join(dir, 'owner.json'),
          JSON.stringify({pid: 1, host: 'other', at: Date.now()}),
        );
        try {
          stillHolds();
        } catch (e) {
          code = /** @type {any} */ (e).code;
        }
      },
      {
        onBusy: () => {
          throw new Error('busy');
        },
      },
    );
    expect(code).toBe('ERR_LOCK_LOST');
  });

  it(
    'NEW-H: a quiet lock whose holder runs on this computer is never taken over',
    async () => {
      const dir = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'alive-')),
        'x.lock',
      );
      fs.mkdirSync(dir);
      // This process holds it and never renews (a stopped command).
      fs.writeFileSync(
        path.join(dir, 'owner.json'),
        JSON.stringify({pid: process.pid, host: os.hostname(), at: Date.now()}),
      );
      let busy = false;
      await withFolderLock(dir, async () => undefined, {
        waitMs: SILENT_MS + 2000,
        onBusy: () => {
          busy = true;
          throw new Error('busy');
        },
      }).catch(() => undefined);
      expect(busy).toBe(true);
    },
    SILENT_MS * 3,
  );

  it('NEW-L: a built stylesheet cut short is built again by show', async () => {
    await themeEditNew('cut', {cwd});
    const css = path.join(cwd, 'themes/cut/cut.css');
    fs.writeFileSync(css, fs.readFileSync(css, 'utf8').slice(0, 300));
    const r = await themeEditShow('cut', {cwd});
    expect(JSON.stringify(r.data)).toContain('not valid CSS');
    fs.rmSync(path.join(cwd, 'themes/cut'), {recursive: true, force: true});
  }, 240_000);

  it('N9: a damaged preview record is named, so answers do not suggest a preview command', () => {
    const record = path.join(cwd, 'app/theme-preview/theme-preview.json');
    fs.mkdirSync(path.dirname(record), {recursive: true});
    fs.writeFileSync(record, 'garbage');
    expect(previewRecordProblem(cwd)).toMatch(/damaged/);
    fs.rmSync(path.join(cwd, 'app'), {recursive: true, force: true});
  });
});
