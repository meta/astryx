// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A toast's text takes its own color, on the toast alone; text on a
 * gradient is measured where it sits on it, not at a highlight at an edge;
 * and `missed` lists the shape and ring the theme's own changes did not
 * reach (corners a theme left at the base's container size, a focus ring
 * drawn outside a square part), each line followed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-toast-text-color-alone-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await installRealBaseThemes(cwd, ['neutral']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** Follow a printed line, each `&&` step. @param {string} line */
async function follow(line) {
  for (const step of line.split(' && ')) {
    const args = splitCommand(step.slice(step.indexOf('experimental ')));
    if (!args) throw new Error(`cannot read ${step}`);
    const r = await runCli(args, {cwd});
    expect(r.status, `${step}\n${r.stderr}`).toBe(0);
  }
}
/** @param {string} slug */
const data = async slug =>
  /** @type {any} */ (await themeEditShow(slug, {cwd})).data;

describe("a toast's text color", () => {
  it(
    'is taken on the toast alone',
    async () => {
      await themeEditNew('t', {cwd, like: 'neutral'});
      await themeEditSet('t', 'color', '#2a2a2a', {cwd, on: 'toast'});
      const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
      const rules =
        css.match(/[^{}]*\{[^{}]*--color-on-dark:\s*#2a2a2a[^{}]*\}/gi) ?? [];
      expect(rules.length).toBeGreaterThan(0);
      for (const r of rules) expect(r).toMatch(/astryx-toast/);
    },
    T,
  );
});

describe('text on a gradient', () => {
  it(
    'is measured where it sits, not at a highlight at an edge',
    async () => {
      await themeEditNew('g', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet(
          'g',
          'background',
          'linear-gradient(to bottom, #ffffff 0%, #ffffff 30%, #0b3fae 50%, #0b3fae 100%)',
          {cwd, on: 'button', when: 'variant:primary'},
        )
      ).data;
      // The label is measured on the blue middle (a real problem only
      // where its text color is dark on that blue), never on the white
      // highlight.
      const button = r.newProblems.filter((/** @type {any} */ p) =>
        /text in button \(variant primary\)/.test(p.problem),
      );
      for (const p of button) {
        expect(p.problem).toMatch(/where the text sits/);
        expect(p.problem).not.toMatch(/#ffffff, a stop/i);
      }
      expect(
        button.some((/** @type {any} */ p) => / in light /.test(p.problem)),
      ).toBe(false);
    },
    T,
  );
});

describe('missed shape and ring', () => {
  it(
    'names corners the theme left at the base container size, and its line reaches them',
    async () => {
      await themeEditNew('c', {cwd, like: 'neutral'});
      await themeEditSet('c', '--radius-element', '0', {cwd});
      const m = (await data('c')).missed.find((/** @type {any} */ x) =>
        /--radius-container/.test(x.why),
      );
      expect(m?.part).toBe('popover');
      expect(m.line).toMatch(/set c --radius-container 0/);
      await follow(m.line);
      expect(
        (await data('c')).missed.some((/** @type {any} */ x) =>
          /--radius-container/.test(x.why),
        ),
      ).toBe(false);
    },
    T,
  );

  it(
    'names a focus ring drawn outside a square part, and its line draws it inside',
    async () => {
      await themeEditNew('f', {cwd, like: 'neutral'});
      await themeEditSet('f', 'corners', 'square', {cwd});
      const m = (await data('f')).missed.find(
        (/** @type {any} */ x) => x.part === 'focus-ring',
      );
      expect(m?.line).toMatch(/--focus-outline-offset -2px/);
      await follow(m.line);
      expect(
        (await data('f')).missed.some(
          (/** @type {any} */ x) => x.part === 'focus-ring',
        ),
      ).toBe(false);
    },
    T,
  );
});
