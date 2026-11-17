// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The states a picture draws apply Core's own state rules, even those
 * behind a media query the picture's window answers true (Core's hover
 * wash, behind `(hover: hover)`); the open states page shows the states
 * first; an overlay shown in place is no wider than its cell.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import postcss from 'postcss';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {cutCss} from '../../foundation/render/css-cut.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-states-picture-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The rules outside every media query whose selector matches `marked`.
 * @param {string} css
 */
const unguarded = css => {
  /** @type {string[]} */
  const out = [];
  postcss.parse(css).walkRules(rule => {
    for (
      let p = rule.parent;
      p && p.type !== 'root';
      p = /** @type {any} */ (p).parent
    )
      if (p.type === 'atrule' && /** @type {any} */ (p).name === 'media')
        return;
    out.push(`${rule.selector}{${rule.nodes.map(String).join(';')}}`);
  });
  return out;
};

describe('a state the picture draws', () => {
  it('applies a state rule behind a query the picture window answers true', () => {
    const css =
      '@layer a{@media (hover: hover){.b:hover{background-image:linear-gradient(red,red)}}}' +
      '@media (hover: none){.c:hover{color:blue}}' +
      '@media (max-width: 640px){.d:hover{color:green}}';
    const out = cutCss(css, new Set(['b', 'c', 'd']), {states: true});
    const free = unguarded(out);
    // The wash reaches a drawn hover outside its query, in its layer.
    expect(
      free.some(
        r =>
          r.includes('[data-astryx-state~="hover"]') &&
          r.includes('linear-gradient(red,red)'),
      ),
    ).toBe(true);
    /** @type {string[]} */
    const layers = [];
    postcss.parse(out).walkRules(rule => {
      if (
        rule.selector.includes(':hover') ||
        !rule.toString().includes('linear-gradient(red,red)')
      )
        return;
      layers.push(
        /** @type {any} */ (rule.parent)?.name === 'layer'
          ? /** @type {any} */ (rule.parent).params
          : '',
      );
    });
    expect(layers).toEqual(['a']);
    // The real pseudo-class keeps its query; a query the window answers
    // false (a touch screen, a phone width) is never copied.
    expect(free.some(r => r.includes(':hover'))).toBe(false);
    expect(
      free.some(r => r.includes('color:blue') || r.includes('color:green')),
    ).toBe(false);
  });

  it(
    "reaches Core's own hover wash on the open states page",
    async () => {
      await themeEditShow('t', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-overlays.html'),
        'utf8',
      );
      const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map(m => m[1])
        .join('\n');
      const free = unguarded(styles);
      expect(
        free.some(
          r =>
            r.includes('[data-astryx-state~="hover"]') &&
            r.includes('--color-overlay-hover'),
        ),
      ).toBe(true);
      // The states come first on that page.
      const states = html.indexOf('cs-group cs-states');
      const overlays = html.indexOf('cs-group cs-open-group');
      expect(states).toBeGreaterThan(-1);
      expect(states).toBeLessThan(overlays);
    },
    T,
  );
});

describe('an overlay shown in place', () => {
  it('is no wider than its cell', () => {
    expect(SHEET_CSS).toMatch(
      /\.cs-cell \[popover\]\[data-astryx-layer-root\]\{[^}]*max-width:100%!important/,
    );
  });
});
