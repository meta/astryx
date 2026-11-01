// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MenuPress.a11y.chromium.spec.ts
 * @input Built DropdownMenu and Selector stories and real Chromium mouse,
 *   touch (CDP) and pen (CDP) input
 * @output Browser evidence for the menu press model: the row under the
 *   release acts once (a link row included: no native link drag cancels a
 *   mouse press), the highlight follows the pointer, a release outside
 *   closes under a mouse and not under a finger, a touch pan in an
 *   overflowing menu cancels the gesture, a pen behaves like a finger, and
 *   Escape after a press-open returns focus to the trigger
 * @position Real-engine proof for module:DropdownMenu/useMenuPress — the
 *   paths jsdom cannot exercise (hit testing, touch synthesis, scrolling)
 */

import {expect, test, type Page, type CDPSession} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const MENU_STORY = 'core-dropdownmenu--default';
const LINK_STORY = 'core-dropdownmenu--link-rows';
const OVERFLOW_STORY = 'core-dropdownmenu--with-sections';
const SELECTOR_STORY = 'core-selector--default';

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root')).toBeVisible();
}

/** The story items log `<label> clicked`; that line is the activation. */
function collectActivations(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (text.endsWith(' clicked')) {
      seen.push(text);
    }
  });
  return seen;
}

async function center(page: Page, selector: string, name?: string) {
  const locator =
    name == null
      ? page.locator(selector)
      : page.getByRole(selector as 'menuitem' | 'option', {
          name,
          exact: true,
        });
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error(`${selector} ${name ?? ''} has no rendered bounds`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** The story's own controls, not Storybook's addon buttons. */
const TRIGGER = '#storybook-root [aria-haspopup="menu"]';
const COMBOBOX = '#storybook-root [role="combobox"]';

async function enableTouch(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', {
    enabled: false,
  });
  return cdp;
}

const touch = {
  async start(cdp: CDPSession, p: {x: number; y: number}) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{x: p.x, y: p.y, id: 1}],
    });
  },
  async move(cdp: CDPSession, p: {x: number; y: number}) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: p.x, y: p.y, id: 1}],
    });
  },
  async end(cdp: CDPSession) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  },
  async tap(cdp: CDPSession, p: {x: number; y: number}) {
    await touch.start(cdp, p);
    await touch.end(cdp);
  },
  /** A slide in steps, so the browser sees real movement. */
  async slide(
    cdp: CDPSession,
    from: {x: number; y: number},
    to: {x: number; y: number},
    steps = 6,
  ) {
    for (let i = 1; i <= steps; i++) {
      await touch.move(cdp, {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
    }
  },
};

const pen = {
  async press(cdp: CDPSession, p: {x: number; y: number}) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'pen',
    });
  },
  async move(cdp: CDPSession, p: {x: number; y: number}) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 1,
      pointerType: 'pen',
    });
  },
  async release(cdp: CDPSession, p: {x: number; y: number}) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'pen',
    });
  },
};

async function openMenuWithMouse(page: Page) {
  await page.getByRole('button', {name: /Actions|File/}).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('data-astryx-menu-press', '');
  return menu;
}

async function activeRowName(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const row = active?.closest('[role^="menuitem"], [role="option"]');
    return row?.textContent?.trim() ?? null;
  });
}

test.describe('DropdownMenu press model (Chromium)', () => {
  test('mouse: a drag from one row released over another acts on the second, once', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    await mount(page, MENU_STORY);
    const menu = await openMenuWithMouse(page);

    const edit = await center(page, 'menuitem', 'Edit');
    const del = await center(page, 'menuitem', 'Delete');
    await page.mouse.move(edit.x, edit.y);
    await page.mouse.down();
    await page.mouse.move(del.x, del.y, {steps: 6});
    expect(await activeRowName(page)).toBe('Delete');
    await page.mouse.up();

    await expect.poll(() => activations).toEqual(['Delete clicked']);
    await expect(menu).toBeHidden();
  });

  test('mouse: a press dragged from one link row to another acts on the second; no link drag starts', async ({
    page,
  }) => {
    // The story's Settings row logs this line from its onClick.
    const acted: string[] = [];
    page.on('console', message => {
      if (message.text() === 'leaving for settings') {
        acted.push(message.text());
      }
    });
    await mount(page, LINK_STORY);
    await page.evaluate(() => {
      const probe = window as unknown as {linkDrags: number};
      probe.linkDrags = 0;
      document.addEventListener('dragstart', () => {
        probe.linkDrags += 1;
      });
      // Keep the story in place: the test reads the row's act, not the
      // navigation that follows it.
      document.addEventListener('click', event => {
        if (
          event.target instanceof Element &&
          event.target.closest('a[href]') != null
        ) {
          event.preventDefault();
        }
      });
    });
    await page.getByRole('button', {name: 'Places'}).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    const profile = await center(page, 'menuitem', 'Profile');
    const settings = await center(page, 'menuitem', 'Settings');
    await page.mouse.move(profile.x, profile.y);
    await page.mouse.down();
    await page.mouse.move(settings.x, settings.y, {steps: 6});
    expect(await activeRowName(page)).toBe('Settings');
    await page.mouse.up();

    await expect.poll(() => acted).toEqual(['leaving for settings']);
    await expect(menu).toBeHidden();
    expect(
      await page.evaluate(
        () => (window as unknown as {linkDrags: number}).linkDrags,
      ),
    ).toBe(0);
  });

  test('mouse: a release outside the menu acts on nothing and closes it', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    await mount(page, MENU_STORY);
    const menu = await openMenuWithMouse(page);
    const edit = await center(page, 'menuitem', 'Edit');
    await page.mouse.move(edit.x, edit.y);
    await page.mouse.down();
    await page.mouse.move(edit.x + 400, edit.y + 200, {steps: 6});
    await page.mouse.up();
    await expect(menu).toBeHidden();
    expect(activations).toEqual([]);
  });

  test('mouse: Escape after a press-open returns focus to the trigger, not to the control focused before the press', async ({
    page,
  }) => {
    await mount(page, MENU_STORY);
    // The control a user had focused before reaching for the menu — a field,
    // a toolbar button. The story renders none, so one is added to the page.
    await page.evaluate(() => {
      const before = document.createElement('button');
      before.id = 'focused-before-the-press';
      before.textContent = 'Before';
      document.body.prepend(before);
      before.focus();
    });
    const before = page.locator('#focused-before-the-press');
    await expect(before).toBeFocused();

    const trigger = page.locator(TRIGGER);
    const point = await center(page, TRIGGER);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.mouse.up();
    // The opening release leaves the menu open with focus on the menu, where
    // Escape is read.
    await expect(menu).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(before).not.toBeFocused();
  });

  test('touch: a finger that lands on Edit and lifts on Delete acts on Delete, once; the highlight followed it', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    const cdp = await enableTouch(page);
    await mount(page, MENU_STORY);
    await touch.tap(cdp, await center(page, TRIGGER));
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    const edit = await center(page, 'menuitem', 'Edit');
    const del = await center(page, 'menuitem', 'Delete');
    await touch.start(cdp, edit);
    expect(await activeRowName(page)).toBe('Edit');
    await touch.slide(cdp, edit, del);
    expect(await activeRowName(page)).toBe('Delete');
    await touch.end(cdp);

    await expect.poll(() => activations).toEqual(['Delete clicked']);
    await expect(menu).toBeHidden();
    // Give the browser's own click for the gesture every chance to arrive.
    await page.waitForTimeout(500);
    expect(activations).toEqual(['Delete clicked']);
  });

  test('touch: a tap on a row acts exactly once', async ({page}) => {
    const activations = collectActivations(page);
    const cdp = await enableTouch(page);
    await mount(page, MENU_STORY);
    await touch.tap(cdp, await center(page, TRIGGER));
    await expect(page.getByRole('menu')).toBeVisible();
    await touch.tap(cdp, await center(page, 'menuitem', 'Duplicate'));
    await page.waitForTimeout(500);
    expect(activations).toEqual(['Duplicate clicked']);
  });

  test('touch: a finger released outside acts on nothing and leaves the menu open', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    const cdp = await enableTouch(page);
    await mount(page, MENU_STORY);
    await touch.tap(cdp, await center(page, TRIGGER));
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const edit = await center(page, 'menuitem', 'Edit');
    await touch.start(cdp, edit);
    await touch.slide(cdp, edit, {x: edit.x + 400, y: edit.y + 200});
    await touch.end(cdp);
    await page.waitForTimeout(300);
    await expect(menu).toBeVisible();
    expect(activations).toEqual([]);
  });

  test('touch: a menu a held finger opens stays open when that finger lifts on the trigger', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    const cdp = await enableTouch(page);
    await mount(page, MENU_STORY);
    await touch.start(cdp, await center(page, TRIGGER));
    const menu = page.getByRole('menu');
    // The long-press delay opens the menu with the finger still down.
    await expect(menu).toBeVisible();
    await touch.end(cdp);
    await page.waitForTimeout(400);
    await expect(menu).toBeVisible();
    expect(activations).toEqual([]);
  });

  test('touch: a vertical pan in an overflowing menu scrolls it and acts on nothing', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    const cdp = await enableTouch(page);
    // A short viewport caps the menu below its content so it overflows.
    await page.setViewportSize({width: 800, height: 220});
    await mount(page, OVERFLOW_STORY);
    await touch.tap(cdp, await center(page, TRIGGER));
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect
      .poll(async () =>
        menu.evaluate(el => el.scrollHeight > el.clientHeight + 1),
      )
      .toBe(true);
    await expect
      .poll(async () => menu.evaluate(el => getComputedStyle(el).touchAction))
      .toBe('pan-y pinch-zoom');

    const first = await center(page, 'menuitem', 'New File');
    const scrollBefore = await menu.evaluate(el => el.scrollTop);
    await touch.start(cdp, first);
    await touch.slide(cdp, first, {x: first.x, y: first.y - 80}, 8);
    await touch.end(cdp);
    await page.waitForTimeout(400);

    const scrollAfter = await menu.evaluate(el => el.scrollTop);
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
    expect(activations).toEqual([]);
    await expect(menu).toBeVisible();
  });

  test('touch: a menu whose rows fit declares touch-action pinch-zoom, so a slide stays a slide', async ({
    page,
  }) => {
    await enableTouch(page);
    await mount(page, MENU_STORY);
    await openMenuWithMouse(page);
    const menu = page.getByRole('menu');
    await expect
      .poll(async () => menu.evaluate(el => getComputedStyle(el).touchAction))
      .toBe('pinch-zoom');
  });

  test('pen: a drag released over another row acts on it once; a release outside leaves the menu open', async ({
    page,
  }) => {
    const activations = collectActivations(page);
    const cdp = await page.context().newCDPSession(page);
    await mount(page, MENU_STORY);
    const menu = await openMenuWithMouse(page);

    const edit = await center(page, 'menuitem', 'Edit');
    const dup = await center(page, 'menuitem', 'Duplicate');
    await pen.press(cdp, edit);
    await pen.move(cdp, dup);
    expect(await activeRowName(page)).toBe('Duplicate');
    await pen.release(cdp, dup);
    await expect.poll(() => activations).toEqual(['Duplicate clicked']);
    await expect(menu).toBeHidden();
    await page.waitForTimeout(400);
    expect(activations).toEqual(['Duplicate clicked']);

    // Reopen and release outside: a pen is "a finger" — the menu stays.
    await openMenuWithMouse(page);
    const edit2 = await center(page, 'menuitem', 'Edit');
    await pen.press(cdp, edit2);
    await pen.move(cdp, {x: edit2.x + 400, y: edit2.y + 200});
    await pen.release(cdp, {x: edit2.x + 400, y: edit2.y + 200});
    await page.waitForTimeout(300);
    await expect(page.getByRole('menu')).toBeVisible();
    expect(activations).toEqual(['Duplicate clicked']);
  });
});

test.describe('Selector press model (Chromium)', () => {
  test('touch: a finger that lands on Apple and lifts on Orange selects Orange; the combobox keeps focus', async ({
    page,
  }) => {
    const cdp = await enableTouch(page);
    await mount(page, SELECTOR_STORY);
    const combobox = page.getByRole('combobox');
    await touch.tap(cdp, await center(page, COMBOBOX));
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox).toHaveAttribute('data-astryx-menu-press', '');

    const apple = await center(page, 'option', 'Apple');
    const orange = await center(page, 'option', 'Orange');
    await touch.start(cdp, apple);
    await touch.slide(cdp, apple, orange);
    // The highlight moved through aria-activedescendant; focus never left
    // the combobox.
    const orangeId = await page
      .getByRole('option', {name: 'Orange', exact: true})
      .getAttribute('id');
    await expect(combobox).toHaveAttribute(
      'aria-activedescendant',
      orangeId ?? '',
    );
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('role') ?? null,
      ),
    ).toBe('combobox');
    await touch.end(cdp);

    await expect(listbox).toBeHidden();
    await expect(combobox).toHaveText(/Orange/);
    await page.waitForTimeout(400);
    await expect(combobox).toHaveText(/Orange/);
  });

  test('mouse: a release outside closes the list without selecting; a finger release outside leaves it open', async ({
    page,
  }) => {
    const cdp = await enableTouch(page);
    await mount(page, SELECTOR_STORY);
    const combobox = page.getByRole('combobox');
    await combobox.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    const apple = await center(page, 'option', 'Apple');
    await touch.start(cdp, apple);
    await touch.slide(cdp, apple, {x: apple.x + 400, y: apple.y + 200});
    await touch.end(cdp);
    await page.waitForTimeout(300);
    await expect(listbox).toBeVisible();

    await page.mouse.move(apple.x, apple.y);
    await page.mouse.down();
    await page.mouse.move(apple.x + 400, apple.y + 200, {steps: 6});
    await page.mouse.up();
    await expect(listbox).toBeHidden();
    await expect(combobox).toHaveText(/Select a fruit/);
  });
});
