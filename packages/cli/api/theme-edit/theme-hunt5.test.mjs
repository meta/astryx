// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fifth pass over `astryx experimental theme editor`: rungs that
 * give the same radius on a part as on the whole theme, corner spellings,
 * spacing where it shows, saved scope names, state blocks in text, an exact
 * property over a dial, the step back's token changes, damaged base or mode
 * fixed by setting them, contrast per variant, and silent locks.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {styledChanges} from './_context.mjs';
import {
  withFolderLock,
  SILENT_MS,
} from '../../foundation/release/folder-lock.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

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

/** @param {string} slug @param {(d: any) => void} edit */
const editSettings = (slug, edit) => {
  const file = path.join(cwd, `themes/${slug}/${slug}.settings.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(data);
  fs.writeFileSync(file, JSON.stringify(data));
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt5-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('corners', () => {
  it('a rung gives a card what it gives the container radius; pill keeps checkboxes square', async () => {
    const whole = await themeEditSet('t', 'corners', 'large', {cwd});
    const container = /--radius-container: [\d.]+px -> ([\d.]+px)/.exec(
      whole.data.changedTokens.join(' '),
    )?.[1];
    await themeEditUndo('t', {cwd});
    await themeEditSet('t', 'corners', 'large', {cwd, on: 'card'});
    expect(read('themes/t/t.css')).toContain(`${container}`);
    await themeEditUndo('t', {cwd});
    const pill = await themeEditSet('t', 'corners', 'pill', {cwd});
    expect(pill.data.changedTokens.join(' ')).toMatch(
      /--radius-inner: [^>]*-> 6px/,
    );
    await themeEditUndo('t', {cwd});
  }, 240_000);

  it('takes a rung in any case and px written any way; suggests a value it takes for the rest', async () => {
    for (const [typed, stored] of [
      ['PILL', 'pill'],
      ['6PX', '6px'],
      ['0006px', '6px'],
      ['.5px', '0.5px'],
      ['0', 'square'],
    ]) {
      const r = await themeEditSet('t', 'corners', typed, {cwd});
      expect(r.data.setting.value, typed).toBe(stored);
      await themeEditUndo('t', {cwd});
    }
    expect(
      (await refusal(() => themeEditSet('t', 'corners', '1.5rem', {cwd})))
        .run[0],
    ).toMatch(/corners 24px$/);
    expect(
      (await refusal(() => themeEditSet('t', 'corners', '50%', {cwd}))).run[0],
    ).toMatch(/corners pill$/);
  }, 240_000);

  it('a step on a member set alone does not spread', async () => {
    await themeEditSet('t', 'corners', 'pill', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const r = await themeEditSet('t', 'corners', 'more', {
      cwd,
      on: 'text-input',
    });
    // It stays on the member alone, at the roundest rung it already shows.
    expect(r.data.setting.only).toBe(true);
    expect(r.data.setting.value).toBe('pill');
    // The step changed nothing, so one undo removes the first setting.
    await themeEditUndo('t', {cwd});
  }, 240_000);

  it('an exact border-radius on the part names itself over a corners dial', async () => {
    await themeEditSet('t', 'border-radius', '3px', {cwd, on: 'card'});
    const r = await themeEditSet('t', 'corners', 'pill', {cwd, on: 'card'});
    expect(r.data.notes.join(' ')).toContain('is an exact property and wins');
    await themeEditUndo('t', {cwd});
    await themeEditUndo('t', {cwd});
  }, 240_000);
});

describe('spacing and scope', () => {
  it('refuses spacing in a state and on a part that reads no spacing', async () => {
    expect(
      (
        await refusal(() =>
          themeEditSet('t', 'spacing', 'roomy', {
            cwd,
            on: 'button',
            state: 'hover',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_NO_EFFECT');
    expect(
      (
        await refusal(() =>
          themeEditSet('t', 'spacing', 'roomy', {cwd, on: 'divider'}),
        )
      ).code,
    ).toBe('ERR_THEME_NO_EFFECT');
  });

  it('a saved setting on a part, state or variant this Core lacks is refused with its undo', async () => {
    await themeEditNew('s', {cwd});
    for (const bad of [
      {thing: 'spacing', value: 'roomy', source: 'dial', on: 'bogus'},
      {
        thing: 'color',
        value: 'red',
        source: 'property',
        on: 'button',
        state: 'wobble',
      },
      {thing: 'surfaces', value: 'flat', source: 'dial', on: 'card'},
    ]) {
      editSettings('s', d => {
        d.settings = [bad];
      });
      const r = await refusal(() => themeEditShow('s', {cwd}));
      expect(r.code, JSON.stringify(bad)).toBe('ERR_THEME_INVALID');
      expect(r.run[0]).toMatch(/undo s /);
    }
    fs.rmSync(path.join(cwd, 'themes/s'), {recursive: true, force: true});
  }, 240_000);

  it('a damaged mode or base is fixed by setting it', async () => {
    await themeEditNew('m', {cwd});
    editSettings('m', d => {
      delete d.mode;
      d.like = 'nope';
    });
    const r = await refusal(() => themeEditShow('m', {cwd}));
    expect(r.run[0]).toMatch(/set m mode both$/);
    await themeEditSet('m', 'mode', 'both', {cwd});
    await themeEditShow('m', {cwd});
    fs.rmSync(path.join(cwd, 'themes/m'), {recursive: true, force: true});
  }, 240_000);
});

describe('reports', () => {
  it('a state block lists each property it changes', () => {
    const lines = styledChanges(
      {components: {}},
      {
        components: {
          button: {'variant:primary': {':hover': {borderRadius: '9999px'}}},
        },
      },
    );
    expect(lines).toEqual([
      'button variant:primary :hover: border-radius 9999px',
    ]);
  });

  it('the step back reports its token changes', async () => {
    await themeEditSet('t', 'corners', 'round', {cwd});
    const r = await themeEditUndo('t', {cwd});
    expect(/** @type {any} */ (r.data).changedTokens.join(' ')).toContain(
      '--radius-element',
    );
  }, 240_000);

  it('measures text per variant of a part', async () => {
    const r = await themeEditSet('t', 'background', '#ff0000', {
      cwd,
      on: 'button',
    });
    expect(r.data.problems.join(' ')).toMatch(/variant \w+/);
    await themeEditUndo('t', {cwd});
  }, 240_000);
});

describe('locks', () => {
  it(
    'a lock whose record is not renewed is taken over, whoever it names',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silent-lock-'));
      const lock = path.join(dir, 'x.lock');
      fs.mkdirSync(lock);
      // A live holder this run cannot judge (pid 1), that never renews.
      fs.writeFileSync(
        path.join(lock, 'owner.json'),
        JSON.stringify({pid: 1, host: os.hostname(), at: Date.now()}),
      );
      const started = Date.now();
      await withFolderLock(lock, async () => undefined, {
        waitMs: SILENT_MS * 3,
        onBusy: () => {
          throw new Error('busy');
        },
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(SILENT_MS - 100);
      fs.rmSync(dir, {recursive: true, force: true});
    },
    SILENT_MS * 4,
  );
});

describe('astracat on #11262', () => {
  it('a big file named like the theme is never read', async () => {
    const big = path.join(cwd, 'themes/t/t.design.psd');
    // Sparse: 3 GiB on disk as a hole, past what a read can hold.
    const fd = fs.openSync(big, 'w');
    fs.ftruncateSync(fd, 3 * 1024 ** 3);
    fs.closeSync(fd);
    await themeEditSet('t', 'corners', 'small', {cwd});
    await themeEditUndo('t', {cwd});
    expect(fs.statSync(big).size).toBe(3 * 1024 ** 3);
    fs.rmSync(big, {force: true});
  }, 240_000);

  it('a one-mode color on a part keeps the other mode as a color, never inherit', async () => {
    await themeEditSet('t', 'background-color', '#00ff00', {
      cwd,
      on: 'tab',
      mode: 'dark',
    });
    expect(read('themes/t/t.css')).not.toMatch(/light-dark\(inherit/);
    expect(read('themes/t/t.css')).toMatch(/light-dark\([^,]+, #00ff00\)/);
    await themeEditUndo('t', {cwd});
  }, 240_000);
});

describe('chaos round 3', () => {
  it('with the last build unreadable, a change is not called a no-op', async () => {
    await themeEditNew('na', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/na/na.js'), 'x');
    const r = await themeEditSet('na', 'corners', 'pill', {cwd});
    expect(r.data.notes.join(' ')).not.toContain('changes nothing you see');
    fs.rmSync(path.join(cwd, 'themes/na'), {recursive: true, force: true});
  }, 240_000);

  it('a damaged palette config is kept aside only by a change, which says so', async () => {
    await themeEditNew('pc', {cwd, settings: {accent: 'teal'}});
    const dir = path.join(cwd, 'themes/pc');
    fs.writeFileSync(path.join(dir, 'palette.config.json'), '{"x":');
    await themeEditShow('pc', {cwd});
    await refusal(() => themeEditUndo('pc', {cwd, thing: '--color-accent'}));
    expect(fs.existsSync(path.join(dir, 'palette.config.damaged.json'))).toBe(
      false,
    );
    const r = await themeEditSet('pc', 'corners', 'pill', {cwd});
    expect(r.data.notes.join(' ')).toContain('palette.config.damaged.json');
    expect(
      fs.readFileSync(path.join(dir, 'palette.config.damaged.json'), 'utf8'),
    ).toBe('{"x":');
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);

  it('a render folder left by a stopped command is removed', async () => {
    const left = path.join(cwd, 'themes/.astryx-render-999999-abcdef');
    fs.mkdirSync(left, {recursive: true});
    fs.writeFileSync(path.join(left, 'preview-t.mjs'), '');
    await themeEditSet('t', 'corners', 'small', {cwd});
    await themeEditUndo('t', {cwd});
    expect(fs.existsSync(left)).toBe(false);
  }, 240_000);

  it('undo after a gray-seeded color writes the same bytes', async () => {
    await themeEditNew('zz', {cwd, settings: {success: '#000000'}});
    const file = path.join(cwd, 'themes/zz/palette.config.json');
    const before = fs.readFileSync(file, 'utf8');
    await themeEditSet('zz', 'success', 'red', {cwd});
    await themeEditUndo('zz', {cwd});
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    fs.rmSync(path.join(cwd, 'themes/zz'), {recursive: true, force: true});
  }, 240_000);

  it('a one-mode theme changes the build', async () => {
    await themeEditNew('mo', {cwd, like: 'neutral'});
    const css = () => read('themes/mo/mo.css');
    const before = css();
    await themeEditSet('mo', 'mode', 'dark-only', {cwd});
    expect(css()).not.toBe(before);
    await themeEditUndo('mo', {cwd});
    expect(css()).toBe(before);
    fs.rmSync(path.join(cwd, 'themes/mo'), {recursive: true, force: true});
  }, 240_000);

  it('how refuses a theme whose source no longer extends its settings', async () => {
    await themeEditNew('hd', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/hd/hd.theme.ts'), 'garbage(((');
    const r = await refusal(() =>
      themeEditHow('make it more colorful', {cwd, theme: 'hd'}),
    );
    expect(r.code).toBe('ERR_THEME_INVALID');
    fs.rmSync(path.join(cwd, 'themes/hd'), {recursive: true, force: true});
  }, 240_000);
});
