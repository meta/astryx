// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thick borders chain reaches the parts that draw a box only when
 * selected and the indicator lines, read in the compiled stylesheet; and
 * squaring the pills leaves a radio round. On the installed Core, which draws
 * the circle at 50%, Core itself keeps it round and the build pins nothing. On
 * a Core that draws it with the pill token, the editor finds the radio marks
 * to pin, read from the census with that radius in place of 50%.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {pillDrawnRadios, pillParts} from './_check.mjs';
import {radioMark} from './_settings.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-thick-borders-chain-reaches-',
    FIXTURE_PACKAGES,
  );
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
  /** Core's radius on the radio's circle. */
  const radioRadius = async () =>
    Object.values(
      (await context(cwd)).C.MAP['radio-indicator']?.at?.['border-radius'] ??
        {},
    ).map(String);

  it('on a Core that draws the radio with the pill token, finds its radio marks to keep round, and no pill among them', async () => {
    const C = (await context(cwd)).C;
    // The installed Core draws each radio mark at 50%. The census of a Core
    // that draws it with the pill token differs only in that radius.
    const marks = Object.keys(C.MAP).filter(
      part =>
        radioMark(C, part) &&
        Object.values(C.MAP[part]?.at?.['border-radius'] ?? {}).includes('50%'),
    );
    expect(marks).toEqual(
      expect.arrayContaining(['radio-indicator', 'dropdown-menu-radio']),
    );
    expect(pillDrawnRadios(C)).toEqual([]);
    const pillToken = Object.assign(Object.create(C), {
      MAP: Object.fromEntries(
        Object.entries(C.MAP).map(([part, entry]) => {
          if (!marks.includes(part)) return [part, entry];
          const radius = Object.fromEntries(
            Object.entries(entry.at['border-radius']).map(([at, value]) => [
              at,
              value === '50%' ? 'var(--radius-full)' : value,
            ]),
          );
          return [part, {...entry, at: {...entry.at, 'border-radius': radius}}];
        }),
      ),
    });
    expect(pillDrawnRadios(pillToken)).toEqual(
      expect.arrayContaining(['radio-indicator', 'dropdown-menu-radio']),
    );
    for (const mark of pillDrawnRadios(pillToken))
      expect(pillParts(pillToken)).not.toContain(mark);
  }, 240_000);

  it('on a Core that draws the radio at 50%, squares every pill and circle, with no radio pin', async ({
    skip,
  }) => {
    await themeEditNew('r1', {cwd});
    const radius = await radioRadius();
    if (radius.some(v => /--radius-full/.test(v))) skip();
    const css = await follow('r1', 'no rounding anywhere');
    // (The pill token goes square too, so the circles that read it do.)
    expect(css).toMatch(/--radius-full:\s*0px/);
    expect(radius).toContain('50%');
    expect(css).not.toMatch(/\.astryx-radio-indicator\s*\{/);
    expect(css).not.toMatch(/\.astryx-dropdown-menu-radio\s*\{/);
  }, 240_000);
});

describe('thick black borders on everything', () => {
  it('reaches the segmented control, the label boxes, the selected nav items and segments, and the indicator lines', async () => {
    await themeEditNew('b1', {cwd});
    const css = await follow('b1', 'thick black borders on everything');
    for (const part of ['segmented-control', 'badge', 'token'])
      expect(rule(css, `.astryx-${part}`), part).toMatch(
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
