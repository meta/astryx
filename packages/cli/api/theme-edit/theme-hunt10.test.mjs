// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The tenth pass over `astryx experimental theme editor`: states Core
 * styles (disabled through aria-disabled, no focus on a part that never
 * takes it), a step with --only from the group value, refusals that keep
 * every scope flag, tabs in values, what applies after an undo of a
 * property, Windows device names, and font suggestions that pass.
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
  cwd = makeLinkedFixture('astryx-theme-hunt10-', FIXTURE_PACKAGES);
  await themeEditNew('h', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const css = () => fs.readFileSync(path.join(cwd, 'themes/h/h.css'), 'utf8');

describe('states', () => {
  it('disabled on a button writes the selector Core uses', async () => {
    await themeEditSet('h', 'opacity', '0.6', {
      cwd,
      on: 'button',
      state: 'disabled',
    });
    expect(css()).toMatch(
      /\.astryx-button:is\(:disabled,\[aria-disabled="true"\]\)\s*\{\s*opacity: 0\.6;/,
    );
    await themeEditUndo('h', {cwd});
  }, 240_000);

  it('focus on a part that never takes focus is refused', async () => {
    const r = await refusal(() =>
      themeEditSet('h', 'background-color', '#ff0000', {
        cwd,
        on: 'switch',
        state: 'focus',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
  }, 240_000);
});

describe('steps and refusals', () => {
  it('a spacing step with --only starts from the group value', async () => {
    await themeEditSet('h', 'spacing', 'spacious', {cwd, on: 'inputs'});
    const r = await themeEditSet('h', 'spacing', 'less', {
      cwd,
      on: 'text-area',
      only: true,
    });
    expect(r.data.setting.value).toBe('roomy');
    await themeEditUndo('h', {cwd});
    await themeEditUndo('h', {cwd});
  }, 240_000);

  it('a --mode refusal keeps --when, --state and --only', async () => {
    const dial = await refusal(() =>
      themeEditSet('h', 'corners', 'small', {
        cwd,
        on: 'button',
        when: 'size:sm',
        mode: 'dark',
      }),
    );
    expect(dial.run[0]).toMatch(/--on button --when size:sm$/);
    const prop = await refusal(() =>
      themeEditSet('h', 'padding', '4px', {
        cwd,
        on: 'text-area',
        only: true,
        mode: 'dark',
      }),
    );
    expect(prop.run[0]).toMatch(/--on text-area --only/);
  }, 240_000);

  it('a tab between value words is white space', async () => {
    const r = await themeEditSet('h', 'padding', '4px\t8px', {
      cwd,
      on: 'button',
    });
    expect(r.data.setting.value).toBe('4px 8px');
    await themeEditUndo('h', {cwd});
  }, 240_000);

  it('undo of an exact radius names the corners dial that applies', async () => {
    await themeEditSet('h', 'corners', 'square', {cwd, on: 'badge'});
    await themeEditSet('h', 'border-radius', '3px', {cwd, on: 'badge'});
    const r = await themeEditUndo('h', {
      cwd,
      thing: 'border-radius',
      on: 'badge',
    });
    expect(/** @type {any} */ (r.data).now).toMatch(/corners = square/);
    await themeEditUndo('h', {cwd, thing: 'corners', on: 'badge'});
  }, 240_000);

  it('a font var() suggests only a command that passes', async () => {
    const r = await refusal(() => themeEditSet('h', 'font', 'var(--x)', {cwd}));
    expect(r.run[0]).not.toMatch(/var\(--x\)/);
  }, 240_000);
});

describe('names', () => {
  it('a Windows device name is refused, with a name that works', async () => {
    const r = await refusal(() => themeEditNew('con', {cwd}));
    expect(r.run[0]).toMatch(/ new con-theme$/);
  });
});
