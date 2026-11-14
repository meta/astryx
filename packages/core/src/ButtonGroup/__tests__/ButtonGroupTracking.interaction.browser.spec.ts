// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupTracking.interaction.browser.spec.ts
 * @input The ButtonGroup SlideAcross story, driven by real touches (the
 *   interaction harness's touch driver), a real mouse and the keyboard
 * @output Real-browser evidence that a button group tracks a held pointer
 *   across its buttons (`family:action-groups` FR1–FR5). A slide runs the
 *   button lifted on, and a lift outside runs nothing. A finger's target
 *   reaches 44 px through each button's touch band, and a mouse's does not.
 *   Under a mouse, only the highlighted button looks pressed. The keyboard is
 *   unchanged.
 * @position Beside ButtonGroupTracking.test.tsx (the unit evidence)
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

const STORY = 'core-buttongroup--slide-across';

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
  const group = page.getByRole('group', {name: 'Edit actions'});
  await expect(group).toBeVisible();
  const button = (name: string) => group.getByRole('button', {name});
  return {
    group,
    cut: button('Cut'),
    copy: button('Copy'),
    paste: button('Paste'),
    log: page.getByTestId('slide-log'),
  };
}

/**
 * A point just below Cut: outside its box, inside the 44 px a finger's
 * target reaches. That is half the shortfall below a small button, less 1 px.
 */
async function justBelow(button: Locator): Promise<Point> {
  const box = await button.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  expect(box.height).toBeLessThan(44);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height + (44 - box.height) / 2 - 1,
  };
}

/** The accessible name of the group the topmost element at `point` is in. */
const groupAt = async (page: Page, point: Point) =>
  page.evaluate(({x, y}) => {
    const element = document.elementFromPoint(x, y);
    return (
      element?.closest('[role="group"]')?.getAttribute('aria-label') ?? null
    );
  }, point);

test('a finger that presses Cut and slides to Paste runs Paste, once (family:action-groups FR1)', async ({
  page,
}) => {
  const {cut, paste, log} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(slide(await centerOf(cut), await centerOf(paste)));
  await expect(log).toHaveText('Pressed: Paste');
});

/** The accessible name of the focused element, or `body`. */
const focusedName = async (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element == null || element === document.body
      ? 'body'
      : (element.getAttribute('aria-label') ?? element.textContent ?? '');
  });

test('after a finger slides from Cut to Paste, Paste has focus, as a tap on it leaves it (family:action-groups FR1)', async ({
  page,
}) => {
  const {cut, paste, log} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(slide(await centerOf(cut), await centerOf(paste)));
  await expect(log).toHaveText('Pressed: Paste');
  expect(await focusedName(page)).toBe('Paste');
});

test('a finger tap on Copy leaves Copy with focus, as a tap on any button does (family:action-groups FR1)', async ({
  page,
}) => {
  const {copy, log} = await open(page);
  const driver = await touchDriver(page);
  await driver.play(tap(await centerOf(copy), {holdMs: 60}));
  await expect(log).toHaveText('Pressed: Copy');
  expect(await focusedName(page)).toBe('Copy');
});

test('a finger lifted outside the group runs nothing (family:action-groups FR3)', async ({
  page,
}) => {
  const {group, cut, log} = await open(page);
  const box = await group.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  const driver = await touchDriver(page);
  await driver.play(
    slide(await centerOf(cut), {
      x: box.x + box.width / 2,
      y: box.y + box.height + 120,
    }),
  );
  // Let any click the browser might still send arrive.
  await frames(page, 4);
  await expect(log).toHaveText('Nothing pressed');
});

test("under a finger a small button's target reaches 44 px: the point just below it lands on the group, and a tap there runs it (family:action-groups FR5)", async ({
  page,
}) => {
  const {cut, log} = await open(page);
  const below = await justBelow(cut);
  // Each button's band is CSS, there from the group's first frame.
  await expect.poll(async () => groupAt(page, below)).toBe('Edit actions');
  const driver = await touchDriver(page);
  await driver.play(tap(below));
  await expect(log).toHaveText('Pressed: Cut');
});

test('under a finger a group wider than its buttons takes only presses their targets hold: a tap beside them keeps its click (family:action-groups FR5)', async ({
  page,
}) => {
  const {group, cut, paste, log} = await open(page);
  const root = await group.boundingBox();
  const first = await cut.boundingBox();
  const last = await paste.boundingBox();
  if (root == null || first == null || last == null) {
    throw new Error('no box');
  }
  // The story's column stretches the root past its last button.
  expect(first.width).toBeGreaterThan(0);
  expect(last.height).toBeGreaterThan(0);
  expect(root.x + root.width - (last.x + last.width)).toBeGreaterThan(60);
  // Cut's band is up: the point just below Cut is in the group.
  await expect
    .poll(async () => groupAt(page, await justBelow(cut)))
    .toBe('Edit actions');
  const x = root.x + root.width - 20;
  const beside = {x, y: root.y + root.height / 2};
  const below = {x, y: root.y + root.height + 4};
  // The layer covers only the buttons' targets: below the empty part is not
  // the group.
  expect(await groupAt(page, below)).toBeNull();
  // Each lift's final default, read after its dispatch ends.
  await page.evaluate(() => {
    const lifts: boolean[] = [];
    Object.assign(window, {lifts});
    window.addEventListener('touchend', event => {
      setTimeout(() => lifts.push(event.defaultPrevented));
    });
  });
  const driver = await touchDriver(page);
  await driver.play(tap(beside));
  await driver.play(tap(below));
  await frames(page, 4);
  // Nothing took either press, so the browser's click for each still runs.
  expect(
    await page.evaluate(() => (window as unknown as {lifts: boolean[]}).lifts),
  ).toEqual([false, false]);
  await expect(log).toHaveText('Nothing pressed');
});

test("under a finger the end buttons' targets reach past the group, and a hidden member grows nothing (spec:AST-094 FR42)", async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-buttongroup--icon-only');
  const group = page.getByRole('group', {name: 'Text formatting'});
  const first = await group.getByRole('button', {name: 'Bold'}).boundingBox();
  const last = await group
    .getByRole('button', {name: 'Underline'})
    .boundingBox();
  if (first == null || last == null) {
    throw new Error('no box');
  }
  expect(first.width).toBeLessThan(44);
  const middle = first.y + first.height / 2;
  for (const point of [
    {x: first.x - 3, y: middle},
    {x: last.x + last.width + 3, y: middle},
  ]) {
    await expect.poll(async () => groupAt(page, point)).toBe('Text formatting');
  }
  // A hidden member's empty box sits at the viewport's corner and grows
  // nothing: nothing of the group lies over a link far above it.
  const above = await group.evaluate(root => {
    const link = root.ownerDocument.createElement('a');
    link.href = '#above';
    link.textContent = 'Above';
    link.style.cssText = 'display:block;height:20px;margin-bottom:100px';
    root.before(link);
    root
      .querySelector<HTMLElement>('[aria-label="Italic"]')
      ?.style.setProperty('display', 'none');
    const box = link.getBoundingClientRect();
    return {x: box.left + 20, y: box.top + 10};
  });
  // The bands are CSS: they follow the group's new size in its next frame.
  await frames(page, 6);
  const link = await page.getByRole('link', {name: 'Above'}).boundingBox();
  expect(link?.width ?? 0).toBeGreaterThan(0);
  expect(link?.height ?? 0).toBeGreaterThan(0);
  // A finger there lands on the link itself, not on the group's hit area.
  await expect
    .poll(async () =>
      page.evaluate(
        ({x, y}) => document.elementFromPoint(x, y)?.textContent ?? '',
        above,
      ),
    )
    .toBe('Above');
});

test("the selection that the lifted button's own click makes stays, after a tap and after a slide (spec:AST-094 FR41)", async ({
  page,
}) => {
  const {cut, copy, log} = await open(page);
  await page.evaluate(() => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Text the Cut action selects';
    document.body.prepend(paragraph);
    const cutButton = [...document.querySelectorAll('button')].find(
      button => button.textContent === 'Cut',
    );
    cutButton?.addEventListener('click', () => {
      getSelection()?.selectAllChildren(paragraph);
    });
  });
  const selected = async () => page.evaluate(() => String(getSelection()));
  const driver = await touchDriver(page);
  const at = await centerOf(cut);
  await driver.play(tap(at));
  await expect(log).toHaveText('Pressed: Cut');
  // Past the lift's click and the tasks after it.
  await frames(page, 4);
  expect(await selected()).toBe('Text the Cut action selects');
  await page.evaluate(() => getSelection()?.removeAllRanges());
  await driver.play(slide(await centerOf(copy), at));
  await expect(log).toHaveText('Pressed: Cut, Cut');
  await frames(page, 4);
  expect(await selected()).toBe('Text the Cut action selects');
});

test('a menu trigger in the group keeps its own opening: a tap on it opens its menu (spec:AST-094 FR29)', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-buttongroup--with-dropdown-menu');
  const trigger = page.getByRole('button', {name: 'Allow options'});
  await expect(trigger).toBeVisible();
  // The engine's own tap path: WebKit synthesises the click only from it,
  // and the trigger opens on that click.
  const driver = await touchDriver(page);
  await driver.tap(await centerOf(trigger));
  await expect(
    page.getByRole('menuitem', {name: 'Always allow'}),
  ).toBeVisible();
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

test("under a finger the pixels on a button's own edges are the button's: each band lies below its button's content", async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  await expect(page.getByRole('group').first()).toBeVisible();
  // Each button's top edge, and its start edge, exactly on its box: the index
  // of the member there (-1 for anything else, such as the group).
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

test("under a finger an enabled group's root keeps its stacking, as with a mouse: each button draws its own touch band", async ({
  page,
}) => {
  for (const story of [
    'core-buttongroup--horizontal',
    'core-buttongroup--with-dropdown-menu',
  ]) {
    await openStory(page, storybook(), story);
    const group = page.getByRole('group').first();
    await expect(group).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    expect(await stackingOf(group)).toEqual({
      position: 'static',
      isolation: 'auto',
      siblingOverChild: true,
      childPlacesAgainstGroup: false,
      childAboveSibling: true,
    });
  }
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test("a desktop group root keeps its stacking: a positioned child places as before, and a child's z-index still beats a lower sibling's", async ({
    page,
  }) => {
    // Stories that main ships too, so this case runs on a build of main.
    for (const story of [
      'core-buttongroup--horizontal',
      'core-buttongroup--with-dropdown-menu',
    ]) {
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

  test("a mouse's target does not grow: the point just below a small button is not the group", async ({
    page,
  }) => {
    const {cut} = await open(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const below = await justBelow(cut);
    // Give a hit-area measurement its frames: a fine pointer gets none.
    await frames(page, 4);
    expect(await groupAt(page, below)).toBeNull();
  });

  test('a mouse press on Cut released on Paste runs nothing, as a native button does: only Cut stays pressed (family:action-groups FR1)', async ({
    page,
  }) => {
    const {group, cut, paste, log} = await open(page);
    const from = await centerOf(cut);
    const to = await centerOf(paste);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    expect(await cut.evaluate(el => el.matches(':active'))).toBe(true);
    expect(await paste.evaluate(el => el.matches(':active'))).toBe(false);
    // No tracker paints a desktop press.
    await expect(group.locator('[data-astryx-press]')).toHaveCount(0);
    await page.mouse.up();
    await frames(page, 2);
    await expect(log).toHaveText('Nothing pressed');
  });

  test("a click on Cut keeps the page's text selection, so a copy or cut action has text to act on (spec:AST-094 FR41)", async ({
    page,
  }) => {
    const {cut, log} = await open(page);
    const text = 'Text a Cut or Copy action reads';
    await page.evaluate(probe => {
      const paragraph = document.createElement('p');
      paragraph.textContent = probe;
      document.body.prepend(paragraph);
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, text);
    const selected = async () => page.evaluate(() => String(getSelection()));
    expect(await selected()).toBe(text);
    const at = await centerOf(cut);
    await page.mouse.click(at.x, at.y);
    await expect(log).toHaveText('Pressed: Cut');
    expect(await selected()).toBe(text);
  });

  test('the selection that the clicked button’s own click makes stays', async ({
    page,
  }) => {
    const {cut, log} = await open(page);
    const text = 'Text the Cut action selects';
    await page.evaluate(probe => {
      const paragraph = document.createElement('p');
      paragraph.textContent = probe;
      document.body.prepend(paragraph);
      const cutButton = [...document.querySelectorAll('button')].find(
        button => button.textContent === 'Cut',
      );
      cutButton?.addEventListener('click', () => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      });
    }, text);
    const selected = async () => page.evaluate(() => String(getSelection()));
    const at = await centerOf(cut);
    await page.mouse.click(at.x, at.y);
    await expect(log).toHaveText('Pressed: Cut');
    // Past the press's own mouseup and click, and the task after them.
    await frames(page, 4);
    expect(await selected()).toBe(text);
  });

  test('holding Space on a focused button still paints its pressed look (the keyboard is unchanged)', async ({
    page,
  }) => {
    const {cut} = await open(page);
    await cut.focus();
    await page.keyboard.down('Space');
    await expect
      .poll(async () =>
        cut.evaluate(el => getComputedStyle(el).backgroundImage),
      )
      .not.toBe('none');
    await page.keyboard.up('Space');
  });

  test('a menu trigger in the group keeps its own opening: a click on it opens its menu', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-buttongroup--with-dropdown-menu');
    await page.getByRole('button', {name: 'Allow options'}).click();
    await expect(
      page.getByRole('menuitem', {name: 'Always allow'}),
    ).toBeVisible();
  });

  test('the keyboard is unchanged: Space and Enter on a focused button run it once each', async ({
    page,
  }) => {
    const {cut, log} = await open(page);
    await cut.focus();
    await page.keyboard.press('Space');
    await expect(log).toHaveText('Pressed: Cut');
    await page.keyboard.press('Enter');
    await expect(log).toHaveText('Pressed: Cut, Cut');
  });
});
