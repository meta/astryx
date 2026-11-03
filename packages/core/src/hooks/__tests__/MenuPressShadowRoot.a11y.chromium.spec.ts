// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MenuPressShadowRoot.a11y.chromium.spec.ts
 * @input The `a11y/Menu press in a shadow root` stories in a built Storybook,
 *   real mouse input, and CDP touch input.
 * @output Real-engine proof that a menu inside a shadow root acts on the row
 *   under a released pointer (module:DropdownMenu/useMenuPress FR1). A mouse's
 *   and a finger's slide work alike. A ContextMenu there also tells a press on
 *   its own rows from a press outside it: a mouse's at once, a finger's on its
 *   lift.
 * @position Run with `pnpm test:a11y-contract`. Only a real engine resolves a
 *   point inside a shadow root to the shadow host at the document level.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

const STORY = 'a11y-menu-press-in-a-shadow-root--selector-in-shadow-root';

test('a mouse click on an option inside a shadow root selects it', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  // Playwright's role locators pierce open shadow roots.
  await page.getByRole('combobox', {name: 'Fruit'}).click();
  const option = page.getByRole('option', {name: 'Banana'});
  await expect(option).toBeVisible();
  const box = await option.boundingBox();
  if (box == null) {
    throw new Error('the Banana option has no layout box');
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByTestId('selected-value')).toHaveText('Banana');
});

test('a finger slide from Apple to Banana inside a shadow root selects Banana', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.getByRole('combobox', {name: 'Fruit'}).click();
  await expect(page.getByRole('option', {name: 'Banana'})).toBeVisible();

  // A real finger slide pans this list, since its touch-action allows it.
  // Dispatched touch pointer events keep the engine's own hit test and its
  // retargeting at the shadow host.
  await page.getByTestId('shadow-host').evaluate(host => {
    const root = host.shadowRoot;
    const fire = (type: string, name: string) => {
      const option = [
        ...(root?.querySelectorAll('[role="option"]') ?? []),
      ].find(element => element.textContent?.includes(name));
      if (root == null || option == null) {
        throw new Error(`no ${name} option in the shadow root`);
      }
      const box = option.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      (root.elementFromPoint(x, y) ?? option).dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    };
    fire('pointerdown', 'Apple');
    fire('pointermove', 'Banana');
    fire('pointerup', 'Banana');
  });

  await expect(page.getByTestId('selected-value')).toHaveText('Banana');
});

const CONTEXT_STORY =
  'a11y-menu-press-in-a-shadow-root--context-menu-in-shadow-root';

/** The center of a box, and a point in the host's own padding. */
async function points(page: Page) {
  const trigger = await page
    .getByText('Right-click inside the shadow root')
    .boundingBox();
  const host = await page.getByTestId('shadow-host').boundingBox();
  if (trigger == null || host == null) {
    throw new Error('the trigger or its shadow host has no layout box');
  }
  return {
    trigger: {
      x: trigger.x + trigger.width / 2,
      y: trigger.y + trigger.height / 2,
    },
    hostPadding: {x: host.x + 8, y: host.y + 8},
  };
}

test('a ContextMenu inside a shadow root picks a clicked item, and a press on its host closes it', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${CONTEXT_STORY}&viewMode=story`,
  );
  const {trigger, hostPadding} = await points(page);
  const menu = page.getByRole('menu');

  // At the document, both presses land on the shadow host.
  await page.mouse.click(trigger.x, trigger.y, {button: 'right'});
  await expect(menu).toBeVisible();
  const copy = await page.getByRole('menuitem', {name: 'Copy'}).boundingBox();
  if (copy == null) {
    throw new Error('the Copy item has no layout box');
  }
  await page.mouse.click(copy.x + copy.width / 2, copy.y + copy.height / 2);
  await expect(page.getByTestId('picked-item')).toHaveText('Copy');
  await expect(menu).toBeHidden();

  await page.mouse.click(trigger.x, trigger.y, {button: 'right'});
  await expect(menu).toBeVisible();
  await page.mouse.click(hostPadding.x, hostPadding.y);
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('picked-item')).toHaveText('Copy');
});

test('a ContextMenu inside a shadow root stays open as its opening long press lifts, and a tap on its host closes it', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${CONTEXT_STORY}&viewMode=story`,
  );
  const {trigger, hostPadding} = await points(page);
  const menu = page.getByRole('menu');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: trigger.x, y: trigger.y, id: 1}],
  });
  await expect(menu).toBeVisible({timeout: 2000});
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // Two frames after the lift, its compatibility mouse events have landed.
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  await expect(menu).toBeVisible();

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: hostPadding.x, y: hostPadding.y, id: 2}],
  });
  await expect(menu).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(menu).toBeHidden();
});
