// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Each picture shows its whole page: a page laid out wider than the
 * window is pictured to its width; a navigation drawer that draws nothing
 * closed has no cell on any page; an overlay drawn after its part sits
 * under the control that opens it; and text cut by less than a pixel gets
 * its room too.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {showcaseItems} from './_preview.mjs';
import {
  FIT_CELLS,
  PLACE_LAYERS,
} from '../../foundation/render/picture-window.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const T = 240_000;
const render = path.resolve(import.meta.dirname, '../../foundation/render');

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-whole-page-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a picture', () => {
  it('takes the page to its own width when it is wider than the window', () => {
    expect(
      fs.readFileSync(path.join(render, 'picture-chrome.mjs'), 'utf8'),
    ).toContain('width: Math.max(PICTURE_WINDOW.width, Math.ceil(size.width))');
    expect(
      fs.readFileSync(path.join(render, 'picture-playwright.mjs'), 'utf8'),
    ).toContain('fullPage: true');
  });
});

describe('a navigation drawer', () => {
  it(
    'has no closed cell on its own family page either',
    async () => {
      const {project} = await context(cwd);
      const names = showcaseItems(project, 'navigation').items.map(i => i.name);
      expect(names).not.toContain('MobileNav');
      expect(names.length).toBeGreaterThan(0);
    },
    T,
  );
});

describe('an overlay drawn after its part', () => {
  it('moves under its opener, as far as its item has room', () => {
    const rect = (/** @type {number} */ left, /** @type {number} */ right) => ({
      left,
      right,
    });
    /** @type {Record<string, string>} */
    const set = {};
    const opener = {
      getAttribute: () => 'menu-1',
      closest: () => null,
      getBoundingClientRect: () => rect(300, 360),
    };
    const item = {
      querySelectorAll: () => [opener],
      getBoundingClientRect: () => rect(0, 500),
    };
    const layer = {
      id: '',
      parentElement: {closest: () => null},
      closest: () => item,
      contains: () => false,
      querySelectorAll: () => [{id: 'menu-1'}],
      getBoundingClientRect: () => rect(0, 260),
      style: {
        setProperty: (/** @type {string} */ k, /** @type {string} */ v) =>
          (set[k] = v),
      },
    };
    const document = {querySelectorAll: () => [layer]};
    new Function('document', PLACE_LAYERS)(document);
    // Under the opener would be 300px along; the item has 240px of room.
    expect(set['margin-inline-start']).toBe('240px');
  });
});

describe('text cut by less than a pixel', () => {
  it('gets its room too', () => {
    const self = {
      style: /** @type {Record<string, string>} */ ({}),
      getBoundingClientRect: () => ({
        width: Math.max(240, parseFloat(self.style.minWidth ?? '0') || 0),
      }),
      closest: () => ({clientWidth: 1200}),
      querySelectorAll: () => [
        {
          scrollWidth: 101,
          get clientWidth() {
            return Math.min(
              101,
              100 + (self.getBoundingClientRect().width - 240),
            );
          },
        },
      ],
    };
    new Function('document', 'getComputedStyle', FIT_CELLS)(
      {querySelectorAll: () => [self]},
      () => ({textOverflow: 'ellipsis'}),
    );
    expect(self.style.minWidth).toBe('242px');
  });
});
