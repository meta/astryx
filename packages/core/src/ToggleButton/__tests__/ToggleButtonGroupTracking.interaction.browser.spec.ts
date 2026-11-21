// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToggleButtonGroupTracking.interaction.browser.spec.ts
 * @input The ToggleButton GroupMultiple story, driven by real touches (the
 *   interaction harness's touch driver), a real mouse and the keyboard
 * @output Real-browser evidence that a toggle group tracks a held pointer
 *   across its toggles (`family:action-groups` FR1–FR5). A slide toggles
 *   only the lifted toggle, and a lift outside toggles nothing. A finger's
 *   target reaches 44 px through the group's hit layer. Under a mouse, only
 *   the highlighted toggle looks pressed. The keyboard is unchanged.
 * @position Beside ToggleButtonGroupTracking.test.tsx (the unit evidence)
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  frames,
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type Point,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-togglebutton--group-multiple';

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

const slide = (from: Point, to: Point) =>
  drag(from, to, {durationMs: 240, hz: 60, holdMs: 60, restMs: 120});

async function open(page: Page) {
  await openStory(page, storybook(), STORY);
  const group = page.getByRole('group', {name: 'Text formatting'});
  await expect(group).toBeVisible();
  const toggle = (name: string) => group.getByRole('button', {name});
  return {
    group,
    bold: toggle('Bold'),
    italic: toggle('Italic'),
    underline: toggle('Underline'),
  };
}

/** Which toggles are pressed, in order. */
const pressed = async (group: Locator) =>
  group
    .getByRole('button')
    .evaluateAll(toggles =>
      toggles.map(toggle => toggle.getAttribute('aria-pressed') === 'true'),
    );

test('a finger slid from Bold across Italic to Underline toggles only Underline (family:action-groups FR4)', async ({
  page,
}) => {
  const {group, bold, underline} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(slide(await centerOf(bold), await centerOf(underline)));
  await expect.poll(async () => pressed(group)).toEqual([false, false, true]);
});

/** The accessible name of the focused element, or `body`. */
const focusedName = async (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element == null || element === document.body
      ? 'body'
      : (element.getAttribute('aria-label') ?? element.textContent ?? '');
  });

test('after a finger slides from Bold to Underline, Underline has focus, as a tap on it leaves it (family:action-groups FR1)', async ({
  page,
}) => {
  const {group, bold, underline} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(slide(await centerOf(bold), await centerOf(underline)));
  await expect.poll(async () => pressed(group)).toEqual([false, false, true]);
  expect(await focusedName(page)).toBe('Underline');
});

test('a finger tap on Italic leaves Italic with focus, as a tap on any button does (family:action-groups FR1)', async ({
  page,
}) => {
  const {group, italic} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(tap(await centerOf(italic), {holdMs: 60}));
  await expect.poll(async () => pressed(group)).toEqual([false, true, false]);
  expect(await focusedName(page)).toBe('Italic');
});

test('a finger lifted outside the group toggles nothing (family:action-groups FR3)', async ({
  page,
}) => {
  const {group, bold} = await open(page);
  const box = await group.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  const driver = await touchDriver(page);
  await driver.play(
    slide(await centerOf(bold), {
      x: box.x + box.width / 2,
      y: box.y + box.height + 120,
    }),
  );
  // Let any click the browser might still send arrive.
  await frames(page, 4);
  expect(await pressed(group)).toEqual([false, false, false]);
});

test("under a finger an end toggle's target reaches past the group: a tap 3 px left of Bold toggles Bold (spec:AST-094 FR42)", async ({
  page,
}) => {
  const {group, bold} = await open(page);
  const box = await bold.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  expect(box.width).toBeLessThan(44);
  const beside = {x: box.x - 3, y: box.y + box.height / 2};
  await expect
    .poll(async () =>
      page.evaluate(
        ({x, y}) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[role="group"]')
            ?.getAttribute('aria-label') ?? null,
        beside,
      ),
    )
    .toBe('Text formatting');
  const driver = await touchDriver(page);
  await driver.play(tap(beside));
  await expect.poll(async () => pressed(group)).toEqual([true, false, false]);
});

test("under a finger a toggle's target reaches 44 px: the point just below it lands on the group, and a tap there toggles it (family:action-groups FR5)", async ({
  page,
}) => {
  const {group, bold} = await open(page);
  const box = await bold.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  expect(box.height).toBeLessThan(44);
  const below = {
    x: box.x + box.width / 2,
    y: box.y + box.height + (44 - box.height) / 2 - 1,
  };
  await expect
    .poll(async () =>
      page.evaluate(
        ({x, y}) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[role="group"]')
            ?.getAttribute('aria-label') ?? null,
        below,
      ),
    )
    .toBe('Text formatting');
  const driver = await touchDriver(page);
  await driver.play(tap(below));
  await expect.poll(async () => pressed(group)).toEqual([true, false, false]);
});

/**
 * Layouts that a group's own stacking context would change: a positioned
 * child (as a popover or a tooltip) and a z-indexed sibling over it.
 */
async function stackingOf(group: Locator) {
  return group.evaluate(root => {
    const doc = root.ownerDocument;
    const child = doc.createElement('span');
    child.style.cssText =
      'position:absolute;top:0;left:0;width:8px;height:8px;z-index:2';
    root.appendChild(child);
    const box = child.getBoundingClientRect();
    // The sibling shares the group's parent, so both meet in one context.
    const sibling = doc.createElement('div');
    sibling.style.cssText = 'position:absolute;width:8px;height:8px;z-index:1';
    root.parentElement?.appendChild(sibling);
    const base = (sibling.offsetParent ?? doc.body).getBoundingClientRect();
    sibling.style.top = `${box.top - base.top}px`;
    sibling.style.left = `${box.left - base.left}px`;
    const over = sibling.getBoundingClientRect();
    const result = {
      position: getComputedStyle(root).position,
      isolation: getComputedStyle(root).isolation,
      siblingOverChild:
        Math.abs(over.top - box.top) < 1 && Math.abs(over.left - box.left) < 1,
      childPlacesAgainstGroup: child.offsetParent === root,
      childAboveSibling:
        doc.elementFromPoint(box.left + 4, box.top + 4) === child,
    };
    child.remove();
    sibling.remove();
    return result;
  });
}

test("under a finger the pixels on a toggle's own edges are the toggle's: the group's hit layer lies below its toggles", async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  await expect(page.getByRole('group').first()).toBeVisible();
  // Each toggle's top edge and start edge, exactly on its box. It gives the
  // index of the member there, or -1 for anything else, such as the group.
  const owners = await page.evaluate(() => {
    const group = document.querySelector('[role="group"]');
    const members = group == null ? [] : [...group.querySelectorAll('button')];
    const ownerAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return members.findIndex(
        member => hit != null && (member === hit || member.contains(hit)),
      );
    };
    return members.map(member => {
      const box = member.getBoundingClientRect();
      return {
        top: ownerAt(box.left + box.width / 2, box.top),
        start: ownerAt(box.left, box.top + box.height / 2),
      };
    });
  });
  expect(owners.length).toBeGreaterThan(1);
  expect(owners).toEqual(
    owners.map((_, index) => ({top: index, start: index})),
  );
});

test("under a finger an enabled group's root is positioned: a positioned child places against the group, and a child's z-index still beats a lower sibling's", async ({
  page,
}) => {
  for (const story of [STORY, 'core-togglebutton--group-single']) {
    await openStory(page, storybook(), story);
    const group = page.getByRole('group').first();
    await expect(group).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    expect(await stackingOf(group)).toEqual({
      position: 'relative',
      isolation: 'auto',
      siblingOverChild: true,
      childPlacesAgainstGroup: true,
      childAboveSibling: true,
    });
  }
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test("a desktop group root keeps its stacking: a positioned child places as before, and a child's z-index still beats a lower sibling's", async ({
    page,
  }) => {
    for (const story of [STORY, 'core-togglebutton--group-single']) {
      await openStory(page, storybook(), story);
      const group = page.getByRole('group').first();
      await expect(group).toBeVisible();
      expect(await stackingOf(group)).toEqual({
        position: 'static',
        isolation: 'auto',
        siblingOverChild: true,
        childPlacesAgainstGroup: false,
        childAboveSibling: true,
      });
    }
  });

  test('a mouse press on Bold released on Underline toggles nothing, as a native toggle does: only Bold stays pressed (family:action-groups FR1)', async ({
    page,
  }) => {
    const {group, bold, underline} = await open(page);
    const from = await centerOf(bold);
    const to = await centerOf(underline);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    expect(await bold.evaluate(el => el.matches(':active'))).toBe(true);
    expect(await underline.evaluate(el => el.matches(':active'))).toBe(false);
    // No tracker paints a desktop press.
    await expect(group.locator('[data-astryx-press]')).toHaveCount(0);
    await page.mouse.up();
    await frames(page, 2);
    expect(await pressed(group)).toEqual([false, false, false]);
  });

  test('holding Space on a focused toggle scales it, as on any button (family:action-groups FR5: the keyboard is unchanged)', async ({
    page,
  }) => {
    const {bold} = await open(page);
    await bold.focus();
    expect(await bold.evaluate(el => el.matches(':focus-visible'))).toBe(true);
    await page.keyboard.down('Space');
    await expect
      .poll(async () => bold.evaluate(el => getComputedStyle(el).transform))
      .toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
    await page.keyboard.up('Space');
  });

  test('the keyboard is unchanged: Space on a focused toggle toggles it once', async ({
    page,
  }) => {
    const {group, bold} = await open(page);
    await bold.focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => pressed(group)).toEqual([true, false, false]);
    await page.keyboard.press('Space');
    await expect
      .poll(async () => pressed(group))
      .toEqual([false, false, false]);
  });
});
