// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A list option the keyboard or pointer is on carries Core's
 * `highlighted` state on its row target, and set reaches it: on a selector
 * row, a multi-selector row and a typeahead row.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-option-highlighted-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('h', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('the highlighted option state', () => {
  it('is set on each list row target, in the compiled stylesheet', async () => {
    for (const part of [
      'selector-option-row',
      'multi-selector-option',
      'typeahead-option',
    ]) {
      const r = await themeEditSet('h', 'background-color', '#dbeafe', {
        cwd,
        on: part,
        state: 'highlighted',
      });
      expect(r.data.setting.state, part).toBe('highlighted');
    }
    const css = fs.readFileSync(path.join(cwd, 'themes/h/h.css'), 'utf8');
    for (const part of [
      'selector-option-row',
      'multi-selector-option',
      'typeahead-option',
    ])
      expect(css, part).toContain(
        `.astryx-${part}[data-highlighted="highlighted"]`,
      );
  }, 240_000);
});
