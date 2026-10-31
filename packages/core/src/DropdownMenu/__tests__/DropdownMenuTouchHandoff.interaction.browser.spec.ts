// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchHandoff.interaction.browser.spec.ts
 * @input The built Default DropdownMenu story under the harness's phone
 *   profile, real touch input (Chromium CDP / WebKit's input command), and
 *   UIMenu's handoff distance from the UIKit constants table
 * @output Interaction proofs for the finger that opened DropdownMenu from its
 *   trigger (`spec:AST-094` FR29): once the menu is open under the held
 *   finger, a move shorter than the handoff onto a row and a lift act on
 *   nothing and leave the menu open, however long the finger rested; a
 *   finger that travels past it picks the row it lifts on, once
 * @position Evidence for the handoff in DropdownMenu (and MoreMenu, which
 *   renders it); the machine itself is unit-tested in menuPressGesture.test.ts
 *   and useMenuPress.test.tsx
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  frames,
  openStory,
  path,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';

const storybook = withStorybook(test);

const HANDOFF_PX = UIKIT_GESTURES.menuPress.handoff.value;

/** The element's rendered box; a missing one fails the spec. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  return box;
}

/** Page-side capture of the rows the story reports as picked. */
async function installPickLog(page: Page) {
  await page.evaluate(() => {
    const picked: string[] = [];
    (window as unknown as {__picked: string[]}).__picked = picked;
    // The story reports a pick by logging "<label> clicked".
    // eslint-disable-next-line no-console -- see above
    const original = console.log.bind(console);
    // eslint-disable-next-line no-console -- see above
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].endsWith(' clicked')) {
        picked.push(args[0].replace(' clicked', ''));
      }
      original(...args);
    };
  });
}

const readPicked = async (page: Page) =>
  page.evaluate(() => (window as unknown as {__picked: string[]}).__picked);

interface Layout {
  driver: TouchDriver;
  trigger: Locator;
  /** The trigger's bottom edge, its center x, and the rows' boxes. */
  triggerBottom: number;
  x: number;
  rows: Map<string, {top: number; bottom: number}>;
}

/**
 * The story under a finger, with the open menu's rows measured once its
 * entrance has come to rest: a tap opens it (its lift's click), Escape
 * closes it again.
 */
async function openLayout(page: Page): Promise<Layout> {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPickLog(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  const x = Math.round(box.x + box.width / 2);
  await driver.tap({x, y: Math.round(box.y + box.height / 2)});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popover = page.locator('[popover]:has([role="menu"])').first();
  await waitForRest(popover);
  const rows = new Map<string, {top: number; bottom: number}>();
  for (const name of ['Edit', 'Duplicate']) {
    const row = await boxOf(page.getByRole('menuitem', {name}));
    rows.set(name, {top: row.y, bottom: row.y + row.height});
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(popover);
  return {driver, trigger, triggerBottom: box.y + box.height, x, rows};
}

test('a move shorter than the handoff onto a row, after the menu opened under the held finger, picks nothing and leaves it open', async ({
  page,
}) => {
  const layout = await openLayout(page);
  const edit = layout.rows.get('Edit');
  if (edit == null) {
    throw new Error('no Edit row');
  }
  // The finger rests on the trigger's edge nearest the menu until the menu
  // is open and the press has long settled, then moves 1 px (the first
  // sample the menu sees, where the distance counts from) and on, short of
  // the handoff, onto the first row.
  const start = {x: layout.x, y: Math.floor(layout.triggerBottom) - 1};
  const origin = {x: layout.x, y: start.y + 1};
  const end = {x: layout.x, y: Math.ceil(edit.top) + 1};
  expect(end.y - origin.y).toBeLessThan(HANDOFF_PX);
  expect(end.y).toBeLessThan(edit.bottom);
  await layout.driver.play(
    path(
      progress =>
        progress === 0
          ? start
          : {x: layout.x, y: origin.y + (end.y - origin.y) * progress},
      {holdMs: 1200, durationMs: 120, hz: 30, restMs: 150},
    ),
  );
  await frames(page, 2);
  expect(await readPicked(page)).toEqual([]);
  await expect(layout.trigger).toHaveAttribute('aria-expanded', 'true');
});

test('the finger that opened the menu picks the row it lifts on once it has travelled past the handoff, once', async ({
  page,
}) => {
  const layout = await openLayout(page);
  const duplicate = layout.rows.get('Duplicate');
  if (duplicate == null) {
    throw new Error('no Duplicate row');
  }
  const start = {x: layout.x, y: Math.floor(layout.triggerBottom) - 1};
  const end = {
    x: layout.x,
    y: Math.round((duplicate.top + duplicate.bottom) / 2),
  };
  expect(end.y - start.y).toBeGreaterThan(HANDOFF_PX);
  await layout.driver.play(
    path(
      progress => ({
        x: layout.x,
        y: start.y + (end.y - start.y) * progress,
      }),
      {holdMs: 800, durationMs: 250, hz: 60, restMs: 100},
    ),
  );
  await expect(layout.trigger).toHaveAttribute('aria-expanded', 'false');
  await frames(page, 2);
  expect(await readPicked(page)).toEqual(['Duplicate']);
});
