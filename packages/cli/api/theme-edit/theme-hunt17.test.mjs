// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventeenth pass over `astryx experimental theme editor`:
 * disabled reaches inside only a part with one control, no-rounding words,
 * spacing that never goes to nothing, what applies after undoing a state
 * setting, and focus-within on parts that hold content.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt17-', FIXTURE_PACKAGES);
  await themeEditNew('n', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const css = () => fs.readFileSync(path.join(cwd, 'themes/n/n.css'), 'utf8');

describe('hunt17', () => {
  it('F9-1: disabled on a part holding several controls is its own marker', async () => {
    await themeEditSet('n', 'opacity', '0.4', {
      cwd,
      on: 'radio-list',
      state: 'disabled',
    });
    expect(css()).toMatch(
      /\.astryx-radio-list:is\(:disabled,\[aria-disabled="true"\]\)\s*\{/,
    );
    await themeEditUndo('n', {cwd});
  }, 240_000);

  it('F9-2: no-rounding words are square; spacing none names the tightest rung', async () => {
    for (const v of ['none', 'sharp', 'zero', '0%']) {
      const r = await themeEditSet('n', 'corners', v, {cwd});
      expect(r.data.setting.value, v).toBe('square');
    }
    const r = await refusal(() => themeEditSet('n', 'spacing', 'none', {cwd}));
    expect(r.run[0]).toMatch(/ spacing tight$/);
  }, 240_000);

  it('F9-3: undoing a part state setting names the group state setting', async () => {
    await themeEditSet('n', 'background-color', '#0000ff', {
      cwd,
      on: 'inputs',
      state: 'hover',
    });
    await themeEditSet('n', 'background-color', '#ff0000', {
      cwd,
      on: 'text-input',
      state: 'hover',
      only: true,
    });
    const r = await themeEditUndo('n', {
      cwd,
      thing: 'background-color',
      on: 'text-input',
      state: 'hover',
      only: true,
    });
    expect(/** @type {any} */ (r.data).now).toMatch(/on inputs :hover/);
  }, 240_000);

  it('F8-3 rest: focus-within on a part that holds content', async () => {
    for (const on of ['chat-composer', 'popover', 'dropdown-menu']) {
      // A surface on chat-composer paints its transparent wrapper (refused);
      // the state itself is what this checks.
      const r = await themeEditSet('n', 'opacity', '0.9', {
        cwd,
        on,
        state: 'focus-within',
      });
      expect(r.data.setting.state, on).toBe('focus-within');
    }
  }, 240_000);
});

describe('hunt17, own theme source values', () => {
  it('F9-N6/N5/N3: a non-text token, alone or in a pair, is refused and the build stays', async () => {
    await themeEditNew('w', {cwd});
    const dir = path.join(cwd, 'themes/w');
    const before = fs.readFileSync(path.join(dir, 'w.css'), 'utf8');
    const ts = path.join(dir, 'w.theme.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          "name: 'w',",
          "name: 'w',\n  tokens: {'--radius-container': [8, 8]},",
        ),
    );
    const {themeEditShow} = await import('./theme-edit.mjs');
    const r = await refusal(() => themeEditShow('w', {cwd}));
    expect(r.message).toMatch(/\[light, dark\] pair/);
    expect(r.message).toMatch(/'8px'/);
    expect(fs.readFileSync(path.join(dir, 'w.css'), 'utf8')).toBe(before);
  }, 240_000);
});
