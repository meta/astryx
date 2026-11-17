// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Square corners square every pill that is a styling choice (a badge, a
 * progress track, a switch's track) and keep the parts drawn as circles
 * round (an avatar, a switch's thumb), told apart by the census: a circle's
 * box is square or its shape prop says so. Against real bundled base
 * themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-square-pills-circles-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

describe('square corners', () => {
  it('square the pills and keep the circles round', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const {data} = await themeEditSet('w', 'corners', 'square', {cwd});
    const css = fs.readFileSync(path.join(cwd, 'themes', 'w', 'w.css'), 'utf8');
    for (const pill of ['badge', 'progress-bar-track', 'switch'])
      expect(css, pill).toMatch(
        new RegExp(
          `\\.astryx-${pill} \\{[^}]*border-radius: var\\(--radius-element\\)`,
        ),
      );
    for (const circle of ['avatar', 'switch-thumb', 'slider-thumb'])
      expect(css, circle).not.toMatch(
        new RegExp(`\\.astryx-${circle} \\{[^}]*border-radius`),
      );
    // (No line squares every circle with the pill token.)
    const notes = (data.leftOut ?? []).map((/** @type {any} */ x) => x);
    expect(JSON.stringify(notes)).not.toMatch(/--radius-full 0px/);
    const circles = notes.find((/** @type {any} */ x) =>
      /drawn as circles stay round/.test(x.note),
    );
    expect(circles?.note).toMatch(/avatar/);
    expect(circles?.note).toMatch(/switch-thumb/);
    expect(circles?.note).not.toMatch(/\bbadge\b/);
  }, 240_000);
});
