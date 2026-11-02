// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabPressPointer.interaction.browser.spec.ts
 * @input Uses @playwright/test and the interaction harness (a built
 *   Storybook)
 * @output Proves a Tab's hover and press layer under a fine and a coarse
 *   primary pointer
 * @position Interaction proof for packages/core/src/TabList/Tab.tsx
 *
 * Tab's press layer has a hover branch and a coarse-pointer rule, which
 * StyleX makes exclusive. The outcome on every pointer: a fine pointer
 * paints the hover, then a pressed overlay that differs from it; under a
 * coarse pointer a finger's press paints as an image (`data-astryx-press`),
 * and the colour layer stays transparent while the tab is `:active`.
 * Chromium only: it holds a finger, and forces `:active`, through the
 * DevTools protocol.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** The "Projects" tab: not the story's current one. */
function projectsTab(page: Page) {
  return page.locator('button', {hasText: 'Projects'}).first();
}

/** The tab's colour layer (its first aria-hidden span) and the pointer. */
async function tabState(page: Page): Promise<{
  colour: string;
  image: string;
  press: string | null;
  coarse: boolean;
  hover: boolean;
}> {
  return projectsTab(page).evaluate(element => {
    const layer = element.querySelector('span[aria-hidden="true"]');
    const style = layer == null ? null : getComputedStyle(layer);
    return {
      colour: style?.backgroundColor ?? '',
      image: style?.backgroundImage ?? '',
      press: element.getAttribute('data-astryx-press'),
      coarse: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
    };
  });
}

/** The layer's colour once its transition has landed (three equal reads). */
async function settledColour(page: Page): Promise<string> {
  let last = '';
  let same = 0;
  for (let read = 0; read < 60 && same < 3; read++) {
    const colour = (await tabState(page)).colour;
    same = colour === last ? same + 1 : 1;
    last = colour;
    await page.waitForTimeout(50);
  }
  return last;
}

/** The tab's centre, in page coordinates. */
async function tabCentre(page: Page): Promise<{x: number; y: number}> {
  const box = await projectsTab(page).boundingBox();
  if (box == null) {
    throw new Error('the Projects tab has no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** A finger held on the tab's centre; returns the lift. */
async function holdFinger(
  page: Page,
  cdp: CDPSession,
): Promise<() => Promise<void>> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [await tabCentre(page)],
  });
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  };
}

/** Puts the tab in `:active` (or out of it) through the DevTools protocol. */
async function forceActive(cdp: CDPSession, isActive: boolean): Promise<void> {
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument', {depth: -1});
  const {nodeIds} = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'button',
  });
  for (const nodeId of nodeIds) {
    const {outerHTML} = await cdp.send('DOM.getOuterHTML', {nodeId});
    if (outerHTML.includes('Projects')) {
      await cdp.send('CSS.forcePseudoState', {
        nodeId,
        forcedPseudoClasses: isActive ? ['active'] : [],
      });
      return;
    }
  }
  throw new Error('the Projects tab has no node');
}

test.describe('Tab press layer by pointer', () => {
  test.skip(
    ({browserName}) => browserName !== 'chromium',
    'Chromium holds a finger and forces :active through the DevTools protocol',
  );

  test.describe('fine pointer with hover', () => {
    test.use({isMobile: false, hasTouch: false});
    test('paints the hover, then a pressed overlay that differs from it', async ({
      page,
    }) => {
      await openStory(page, storybook(), 'core-tablist--default');
      await projectsTab(page).hover();
      const state = await tabState(page);
      expect(state.coarse).toBe(false);
      expect(state.hover).toBe(true);
      await expect
        .poll(async () => (await tabState(page)).colour)
        .not.toBe(TRANSPARENT);
      const hovered = await settledColour(page);
      await page.mouse.down();
      // The pressed overlay is its own colour, not the hover paint held on.
      await expect
        .poll(async () => (await tabState(page)).colour)
        .not.toBe(hovered);
      expect(await settledColour(page)).not.toBe(hovered);
      await page.mouse.up();
    });
  });

  test("coarse pointer: a finger's press paints as an image, and the colour layer stays transparent while the tab is :active", async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-tablist--default');
    const cdp = await page.context().newCDPSession(page);
    expect((await tabState(page)).coarse).toBe(true);
    // The finger's press: the press model marks the tab, and the layer
    // paints the pressed overlay as an image.
    const lift = await holdFinger(page, cdp);
    await expect.poll(async () => (await tabState(page)).press).toBe('on');
    expect((await tabState(page)).image).not.toBe('none');
    await lift();
    await expect.poll(async () => (await tabState(page)).press).not.toBe('on');
    // The tab in :active under the coarse pointer: the reset keeps the
    // colour layer transparent, past any transition.
    await forceActive(cdp, true);
    expect(await settledColour(page)).toBe(TRANSPARENT);
    await forceActive(cdp, false);
  });
});
