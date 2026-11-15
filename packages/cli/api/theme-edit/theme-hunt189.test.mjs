// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Squaring the pills keeps a radio's circle (its mark, not a corner),
 * and the thick borders chain reaches the parts that draw a box only when
 * selected and the indicator lines, read in the compiled stylesheet.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt189-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * Run how's first change answer for a question, step by step, through set.
 * @param {string} slug
 * @param {string} question
 */
const follow = async (slug, question) => {
  const {data} = await themeEditHow(question, {cwd, theme: slug});
  const top = data.results.find((/** @type {any} */ r) =>
    r.commands.some((/** @type {string} */ c) => / editor set /.test(c)),
  );
  expect(top, question).toBeDefined();
  // A sequence lists its steps one command each (or as one line).
  const lines = (top.sequence ? top.commands : [top.commands[0]])
    .flatMap((/** @type {string} */ c) => c.split(' && '))
    .map((/** @type {string} */ l) => l.slice(l.indexOf(' set ') + 5));
  for (const line of lines) {
    const [theme, thing, value, ...rest] = /** @type {string[]} */ (
      splitCommand(line)
    );
    /** @type {Record<string, string | boolean>} */
    const options = {cwd};
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i].replace(/^--/, '');
      if (flag === 'only') options.only = true;
      else options[flag] = rest[++i];
    }
    await themeEditSet(theme, thing, value, /** @type {any} */ (options));
  }
  return fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8');
};

/** The declarations of a rule in compiled CSS. @param {string} css @param {string} selector */
const rule = (css, selector) =>
  new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  ).exec(css)?.[1] ?? '';

describe('no rounding anywhere', () => {
  it('squares the pills and keeps the radio marks round', async () => {
    await themeEditNew('r1', {cwd});
    const css = await follow('r1', 'no rounding anywhere');
    expect(css).toMatch(/--radius-full:\s*0px/);
    expect(rule(css, '.astryx-radio-indicator')).toMatch(
      /--radius-full:\s*9999px/,
    );
    expect(rule(css, '.astryx-dropdown-menu-radio')).toMatch(
      /--radius-full:\s*9999px/,
    );
  }, 240_000);
});

describe('thick black borders on everything', () => {
  it('reaches the segmented control, the selected nav items and segments, and the indicator lines', async () => {
    await themeEditNew('b1', {cwd});
    const css = await follow('b1', 'thick black borders on everything');
    expect(rule(css, '.astryx-segmented-control')).toMatch(
      /border:\s*2px solid #000000/,
    );
    for (const part of [
      'side-nav-item',
      'top-nav-item',
      'segmented-control-item',
    ])
      expect(
        rule(css, `.astryx-${part}[data-selected="selected"]`),
        part,
      ).toMatch(/border:\s*2px solid #000000/);
    expect(rule(css, '.astryx-tab-indicator')).toMatch(/height:\s*2px/);
    expect(rule(css, '.astryx-outline-indicator')).toMatch(/width:\s*2px/);
  }, 240_000);
});
