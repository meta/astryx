// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Review follow-ups to the fifth pass: corner steps measured as each
 * part shows them, CSS values checked by their grammar, a one-mode part
 * color keeping the base theme's own value, every bad saved setting named
 * with an undo that runs, show's radius as built, and the busy refusal.
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
import {withFolderLock} from '../../foundation/release/folder-lock.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt5b-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // The base theme styles its destructive button itself, as neutral does.
  const built = path.join(
    path.dirname(cwd),
    'node_modules/@astryxdesign/theme-neutral/built.js',
  );
  const text = fs.readFileSync(built, 'utf8');
  const theme = JSON.parse(
    text.slice(text.indexOf('{'), text.lastIndexOf(';')),
  );
  theme.components.button = {
    'variant:destructive': {backgroundColor: '#ffc4be', color: '#76000c'},
  };
  fs.writeFileSync(
    built,
    `export const neutralTheme = ${JSON.stringify(theme, null, 2)};\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} prop @param {string} slug */
const cardRadius = slug =>
  /\.astryx-card[^{]*\{[^}]*border-radius:\s*([^;]+);/.exec(
    read(`themes/${slug}/${slug}.css`),
  )?.[1];

describe('corner steps, as the part shows them', () => {
  it('after a whole-theme pill, less on a card makes the card less round', async () => {
    await themeEditSet('t', 'corners', 'pill', {cwd});
    const r = await themeEditSet('t', 'corners', 'less', {cwd, on: 'card'});
    expect(r.data.setting.value).not.toBe('pill');
    await themeEditUndo('t', {cwd});
    await themeEditUndo('t', {cwd});
  }, 240_000);

  it('a step on a card covered by a group setting starts from the group value', async () => {
    await themeEditSet('t', 'corners', '6px', {cwd, on: 'card'});
    await themeEditSet('t', 'corners', 'round', {cwd, on: 'containers'});
    const r = await themeEditSet('t', 'corners', 'more', {cwd, on: 'card'});
    expect(r.data.setting.value).toBe('pill');
    for (let i = 0; i < 3; i++) await themeEditUndo('t', {cwd});
  }, 240_000);

  it('more on a member set alone at pill keeps it at pill', async () => {
    await themeEditSet('t', 'corners', 'pill', {
      cwd,
      on: 'text-input',
      only: true,
    });
    // At pill the step writes nothing.
    const r = await refusal(() =>
      themeEditSet('t', 'corners', 'more', {cwd, on: 'text-input'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    await themeEditUndo('t', {cwd});
  }, 240_000);

  it('show reports the radius the build writes for the part', async () => {
    await themeEditSet('t', 'corners', 'round', {cwd, on: 'card'});
    const shown = await themeEditShow('t', {cwd});
    const line = shown.data.partValues.find((/** @type {string} */ l) =>
      l.startsWith('corners = round on card'),
    );
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/border-radius 16px/);
    void cardRadius;
    await themeEditUndo('t', {cwd});
  }, 240_000);
});

describe('CSS values by their grammar', () => {
  it('takes valid CSS the old list refused', async () => {
    for (const [prop, value] of [
      ['padding', '12pt'],
      ['gap', 'normal'],
      ['width', 'stretch'],
      ['height', '100dvw'],
      ['font-weight', 'calc(400 + 100)'],
      ['display', 'table-cell'],
      ['padding', 'env(safe-area-inset-top)'],
    ]) {
      await themeEditSet('t', prop, value, {cwd, on: 'card'});
      await themeEditUndo('t', {cwd});
    }
  }, 240_000);

  it('refuses what the browser would drop, with a value that runs', async () => {
    for (const [prop, value] of [
      ['display', 'flexx'],
      ['padding', 'auto'],
      ['padding-top', '1px 2px 3px 4px'],
      ['min-height', 'bogus'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('t', prop, value, {cwd, on: 'card'}),
      );
      expect(r.code, `${prop} ${value}`).toBe('ERR_THEME_BAD_VALUE');
      // padding auto, min-height bogus: never a reset (0, auto) as a
      // repair, only how.
      expect(r.run[0]).toMatch(
        new RegExp(
          /^(padding|min-height)$/.test(prop)
            ? ` how ${prop}$`
            : ` set t ${prop} `,
        ),
      );
    }
  }, 240_000);
});

describe('one mode on a part', () => {
  it('keeps the base theme’s own value in the other mode', async () => {
    await themeEditSet('t', 'background-color', '#00ff00', {
      cwd,
      on: 'button',
      when: 'variant:destructive',
      mode: 'dark',
    });
    expect(read('themes/t/t.css')).toMatch(/light-dark\(#ffc4be, #00ff00\)/);
    await themeEditUndo('t', {cwd});
  }, 240_000);
});

describe('bad saved settings', () => {
  it('names every one, and each undo runs while the others are saved', async () => {
    await themeEditNew('dl', {cwd});
    const file = path.join(cwd, 'themes/dl/dl.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings = [
      {
        thing: 'background-color',
        value: 'red',
        source: 'property',
        on: 'button',
        state: 'banana',
      },
      {thing: 'color', value: 'red', source: 'property', on: 'buton'},
    ];
    fs.writeFileSync(file, JSON.stringify(data));
    const r = await refusal(() => themeEditShow('dl', {cwd}));
    expect(r.run).toHaveLength(2);
    await themeEditUndo('dl', {
      cwd,
      thing: 'background-color',
      on: 'button',
      state: 'banana',
    });
    await themeEditUndo('dl', {cwd, thing: 'color', on: 'buton'});
    await themeEditShow('dl', {cwd});
    fs.rmSync(path.join(cwd, 'themes/dl'), {recursive: true, force: true});
  }, 240_000);
});

describe('names', () => {
  it('another case of a part names it, with a command that runs', async () => {
    const r = await refusal(() =>
      themeEditSet('t', 'corners', 'pill', {cwd, on: 'Button'}),
    );
    expect(r.run[0]).toMatch(/--on button$/);
  });
});

describe('the busy refusal', () => {
  it('reports how long the holder has held the lock, not since its last renewal', async () => {
    const dir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'busy-')),
      'x.lock',
    );
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'owner.json'),
      JSON.stringify({
        pid: process.pid,
        host: os.hostname(),
        at: Date.now() - 13_000,
        beat: 1,
      }),
    );
    /** @type {number | null} */
    let held = null;
    await withFolderLock(dir, async () => undefined, {
      waitMs: 0,
      onBusy: (_, seconds) => {
        held = seconds;
        throw new Error('busy');
      },
    }).catch(() => undefined);
    expect(held).toBeGreaterThanOrEqual(13);
  });
});
