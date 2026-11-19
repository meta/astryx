// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Several --when conditions at once, one per prop (a ghost small button),
 * as Core's own `prop:value+prop:value` keys: given twice on the command
 * line or joined by +, checked one by one, saved in one order, written as
 * one rule.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {runCli} from '../../test-utils/run-cli.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(['--json', ...args], {cwd});
  return {status: r.status, body: JSON.parse(r.stdout || '{}')};
};

const E = ['experimental', 'theme', 'editor'];

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-multi-when-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  expect((await cli([...E, 'new', 'w'])).status).toBe(0);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The theme's built module. */
const built = () =>
  fs.readFileSync(path.join(cwd, 'themes', 'w', 'w.js'), 'utf8');

describe('several --when conditions', () => {
  it('given twice on the command line, are one rule for both', async () => {
    const r = await cli([
      ...E,
      'set',
      'w',
      'background-color',
      '#dc2626',
      '--on',
      'button',
      '--when',
      'variant:ghost',
      '--when',
      'size:sm',
    ]);
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(0);
    expect(built()).toMatch(/['"]size:sm\+variant:ghost['"]/);
  }, 120_000);

  it('joined by +, in any order, are the same setting', async () => {
    await themeEditSet('w', 'color', '#ffffff', {
      cwd,
      on: 'button',
      when: 'variant:ghost+size:sm',
    });
    await themeEditUndo('w', {
      cwd,
      thing: 'color',
      on: 'button',
      when: 'size:sm+variant:ghost',
    });
    expect(built()).not.toMatch(/#ffffff/i);
  }, 120_000);

  it('checks each one, and never the same prop twice', async () => {
    const bad = await refusal(() =>
      themeEditSet('w', 'color', '#ffffff', {
        cwd,
        on: 'button',
        when: 'variant:ghost+size:huge',
      }),
    );
    expect(bad.code).toBe('ERR_THEME_UNKNOWN_VARIANT');
    expect(bad.message).toMatch(/no size "huge"/);
    const twice = await refusal(() =>
      themeEditSet('w', 'color', '#ffffff', {
        cwd,
        on: 'button',
        when: 'variant:ghost+variant:primary',
      }),
    );
    expect(twice.message).toMatch(/names variant twice/);
    // (The same prop twice on the command line is still refused.)
    const r = await cli([
      ...E,
      'set',
      'w',
      'color',
      '#ffffff',
      '--on',
      'button',
      '--when',
      'variant:ghost',
      '--when',
      'variant:primary',
    ]);
    expect(r.status).not.toBe(0);
  }, 120_000);
});
