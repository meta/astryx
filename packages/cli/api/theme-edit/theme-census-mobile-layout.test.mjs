// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The part census renders a component's mobile layout too: a doc's
 * `playground.mobile` props over its demo are one more catalog item, so the
 * parts only that layout draws (AppShell's menu button in the top bar, its
 * open drawer) are recorded like any part.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {catalogItems} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-census-mobile-', FIXTURE_PACKAGES);
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

  it('adds no item for a component that declares no mobile layout', async () => {
    const project = await openProject(cwd);
    const {items} = catalogItems(project);
    expect(items.filter(i => i.label === 'mobile').map(i => i.name)).toEqual([
      'AppShell',
    ]);
  });
});
