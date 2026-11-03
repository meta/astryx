// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuPressContinuation.interaction.browser.spec.ts
 * @input The built `a11y/Menu press continuation` story, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness, and the
 *   menu press's handoff distance from the UIKit constants table
 * @output Interaction proofs for a pointer handed to a menu as it opens
 *   (`module:DropdownMenu/useMenuPress` FR11), under a finger (the same on
 *   every device, `spec:AST-094` FR43): held on a button until the menu opens
 *   under it, the finger picks the row it lifts on only once it has travelled the
 *   handoff distance from the first position the menu sees; a lift before
 *   that acts on nothing and leaves the menu open
 * @position The real-browser case FR11's verification names, beside the
 *   continuation suite in useMenuPress.test.tsx; the fixture is
 *   menuPressContinuation.fixture.tsx
 */

import {expect, test, type Page} from '@playwright/test';
import {
  frames,
  openStory,
  touchDriver,
  withStorybook,
  type TouchDriver,
  type TouchFrame,
} from '@astryxdesign/interaction-harness';
import {UIKIT_MENU_PRESS} from '../../motion/uikit/gestures';
import {
  CONTINUED_PRESS_HOLD_MS,
  CONTINUED_PRESS_ROW_PX,
} from './menuPressContinuation.geometry';

const storybook = withStorybook(test);

interface OpenFixture {
  driver: TouchDriver;
  /** The button's center, where the finger lands. */
  center: {x: number; y: number};
  /** The center of a row of the menu that opens under the button. */
  rowCenter: (index: number) => {x: number; y: number};
}

async function openFixture(page: Page): Promise<OpenFixture> {
  await openStory(
    page,
    storybook(),
    'a11y-menu-press-continuation--continued-press',
  );
  const driver = await touchDriver(page);
  const box = await page.getByRole('button', {name: 'Hold me'}).boundingBox();
  if (box == null) {
    throw new Error('no button');
  }
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // The menu renders right below the button, one 44 px row after another.
  const rowCenter = (index: number) => ({
    x: center.x,
    y: box.y + box.height + CONTINUED_PRESS_ROW_PX * (index + 0.5),
  });
  return {driver, center, rowCenter};
}

const picked = (page: Page) => page.getByTestId('picked');

/** One finger at `point` at time `t`; no point lifts it. */
const at = (t: number, point?: {x: number; y: number}): TouchFrame => ({
  t,
  fingers: point == null ? [] : [{id: 0, ...point}],
});

/** When the finger first moves: after the menu has opened under it. */
const FIRST_MOVE_MS = CONTINUED_PRESS_HOLD_MS + 250;

test('a finger handed to the menu as it opens picks the row it lifts on, past the handoff distance (module FR11)', async ({
  page,
}) => {
  const fixture = await openFixture(page);
  // Held until the menu opens under it; the first position the menu sees is
  // over the first row, and the finger then slides a whole row, past the
  // handoff distance, onto the second and lifts there.
  const alpha = fixture.rowCenter(0);
  const bravo = fixture.rowCenter(1);
  await fixture.driver.play([
    at(0, fixture.center),
    at(FIRST_MOVE_MS, alpha),
    at(FIRST_MOVE_MS + 50, {x: alpha.x, y: (alpha.y + bravo.y) / 2}),
    at(FIRST_MOVE_MS + 100, bravo),
    at(FIRST_MOVE_MS + 160, bravo),
    at(FIRST_MOVE_MS + 220),
  ]);
  await expect(picked(page)).toHaveText('Bravo');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a lift before the handoff distance acts on nothing and leaves the menu open', async ({
  page,
}) => {
  const fixture = await openFixture(page);
  const handoff = UIKIT_MENU_PRESS.handoff.value;
  // Held until the menu opens; the first position the menu sees is already
  // over the first row, and the finger moves less than the handoff distance
  // there before it lifts. Under the settle rule this lift would pick the row.
  const alpha = fixture.rowCenter(0);
  await fixture.driver.play([
    at(0, fixture.center),
    at(FIRST_MOVE_MS, alpha),
    at(FIRST_MOVE_MS + 50, {x: alpha.x, y: alpha.y + handoff / 2}),
    at(FIRST_MOVE_MS + 160, {x: alpha.x, y: alpha.y + handoff / 2}),
    at(FIRST_MOVE_MS + 220),
  ]);
  await frames(page, 2);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(picked(page)).toHaveText('');
});
