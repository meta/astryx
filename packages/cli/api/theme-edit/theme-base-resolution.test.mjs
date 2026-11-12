// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One base resolution: `new`, `set base` and the suggestions find a
 * base theme package the way the theme build does, from a relative `cwd`
 * too, and a refusal's did-you-mean names the base its command keeps.
 */

import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {baseInstalled, baseModule} from './_project.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-base-res-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('base resolution', () => {
  it('resolves an installed base from an absolute or a relative cwd alike', () => {
    const rel = path.relative(process.cwd(), cwd);
    expect(baseModule(cwd, 'neutral')).toBeTruthy();
    expect(baseModule(rel, 'neutral')).toBe(baseModule(cwd, 'neutral'));
    expect(baseInstalled(rel, 'butter')).toBe(false);
  });

  it('new with a relative cwd guesses the installed base, and its did-you-mean agrees', async () => {
    const rel = path.relative(process.cwd(), cwd);
    const r = await refusal(() =>
      themeEditNew('q', {cwd: rel, like: 'neutrl'}),
    );
    expect(r.run[0]).toMatch(/ new q --like neutral$/);
    expect(r.run.slice(1)).toEqual(['neutral']);
  });

  it('a guessed base for set base is only an installed one', async () => {
    await themeEditNew('b', {cwd});
    const r = await refusal(() => themeEditSet('b', 'base', 'buttr', {cwd}));
    expect(r.run.join(' ')).not.toMatch(/ base butter\b/);
    expect(r.run[0]).toMatch(/ set b base none$/);
  }, 240_000);
});
