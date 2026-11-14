// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text of a part that sits in the app's top bar is measured over the
 * header's background: a part with a see-through background of its own (a
 * segmented control's track, a ghost button, a top nav item) shows the
 * header through it, not the page. The parts measured there are those the
 * census saw inside the header and those the preview's own top bar draws.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {TOP_BAR_COMPONENTS} from './_catalog.mjs';
import {previewRouteSource} from './_preview.mjs';
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
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt130-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('text in the top bar', () => {
  it('a header the theme does not change adds no problem there', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#225bff', {cwd})
    );
    expect(
      /** @type {string[]} */ (r.data.problems).filter(p =>
        p.includes('in the app-shell-header'),
      ),
    ).toEqual([]);
  }, 240_000);

  it("a dark header warns for the preview's segmented labels on it", async () => {
    const r = /** @type {any} */ (
      await themeEditSet('t', 'background', '#000080', {
        cwd,
        on: 'app-shell-header',
      })
    );
    const problems = /** @type {string[]} */ (r.data.problems);
    expect(
      problems.some(p =>
        /^text in segmented-control-item in the app-shell-header \(".+"\) is [\d.]+:1 in light \(.+ on segmented-control's .+ over app-shell-header's #000080\)/.test(
          p,
        ),
      ),
    ).toBe(true);
  }, 240_000);

  it("the preview route's top bar draws only the components the check measures", () => {
    const route = previewRouteSource({
      pages: [{id: 'overview', label: 'Overview', file: '_pages/overview'}],
      theme: {name: 't', module: '../t.js', css: [], mode: 'system'},
    });
    const drawn = [
      ...route.matchAll(
        /import \{([^}]+)\} from '@astryxdesign\/core\/(?:TopNav|SegmentedControl)';/g,
      ),
    ].flatMap(m => m[1].split(',').map(x => x.trim()));
    expect(drawn.sort()).toEqual([...TOP_BAR_COMPONENTS].sort());
  });
});
