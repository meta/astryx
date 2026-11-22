// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The part census renders a component's mobile layout too: a doc's
 * `playground.mobile` props over its demo are one more catalog item, so the
 * parts only that layout draws (AppShell's menu button in the top bar, its
 * open drawer) are recorded like any part. The item is drawn in a phone's
 * window as the browser runs it, so the drawer Core loads on its first open
 * is drawn whole.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {catalogItems} from './_parts.mjs';
import {context} from './_context.mjs';
import {themeEditNew} from './theme-edit.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {openProject} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** @type {string | null} */
let unbuilt = null;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-census-mobile-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the census of a mobile layout', () => {
  it("renders AppShell's mobile props over its demo as one more item", async () => {
    const project = await openProject(cwd);
    expect(project.components.AppShell?.mobile?.mobileNav).toEqual({
      defaultIsMobile: true,
      isOpen: true,
    });
    const {items} = catalogItems(project);
    const mobile = items.filter(
      i => i.name === 'AppShell' && i.label === 'mobile',
    );
    expect(mobile).toHaveLength(1);
    const props = /** @type {any} */ (mobile[0].tree).props;
    expect(props.mobileNav).toEqual({defaultIsMobile: true, isOpen: true});
    // The phone menu draws the top bar's links as its own rows.
    expect(
      props.topNav.props.startContent.map(
        (/** @type {any} */ x) => x.props.label,
      ),
    ).toEqual(['Inbox', 'Reports']);
  });

  it("records the open drawer's parts, which Core loads on the drawer's first open", async ctx => {
    if (unbuilt) return ctx.skip(unbuilt);
    await themeEditNew('mob', {cwd, like: 'neutral'});
    // (The phone menu draws the top bar's links in the drawer: the census
    // reads them there, under the drawer's mode.)
    const {C} = /** @type {any} */ (await context(cwd));
    expect(JSON.stringify(C.MAP['top-nav-item'] ?? {})).toMatch(/mode=drawer/);
  }, 240_000);

  it('adds no item for a component that declares no mobile layout', async () => {
    const project = await openProject(cwd);
    const {items} = catalogItems(project);
    expect(items.filter(i => i.label === 'mobile').map(i => i.name)).toEqual([
      'AppShell',
    ]);
  });
});
