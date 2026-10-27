// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MenuPressShadowRoot.a11y.chromium.spec.ts
 * @input The `a11y/Menu press in a shadow root` stories in a built Storybook,
 *   real mouse input, and CDP touch input.
 * @output Real-engine proof that a menu rendered inside a shadow root acts on
 *   the row under a released pointer (module:DropdownMenu/useMenuPress FR1),
 *   and that a ContextMenu there tells a press on its own rows from a press
 *   outside it, a mouse's at once and a finger's on its lift, from the task
 *   that opened it on.
 * @position Run with `pnpm test:a11y-contract`. Only a real engine resolves a
 *   point inside a shadow root to the shadow host at the document level.
 */

import {expect, test, type Page} from '@playwright/test';
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

test('a ContextMenu inside a shadow root commits its open before the next input: a press on its host right after the right click closes it', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${CONTEXT_STORY}&viewMode=story`,
  );
  const {trigger, hostPadding} = await points(page);
  // The right click, then a press on the host's own padding as the very next
  // input: a browser runs an input event before the page's posted tasks, so
  // the press comes once the right click's microtasks have run and before
  // anything the page queued. The menu shows from a listener inside the
  // shadow root, where `window.event` is unset.
  const shows = await page.evaluate(
    async ({at, outside}) => {
      let count = 0;
      const show = HTMLElement.prototype.showPopover;
      HTMLElement.prototype.showPopover = function (
        this: HTMLElement,
        ...args: Parameters<typeof show>
      ) {
        if (this.querySelector('[role="menu"]') != null) {
          count += 1;
        }
        show.apply(this, args);
      };
      const host = document.querySelector<HTMLElement>(
        '[data-testid="shadow-host"]',
      );
      const target = host?.shadowRoot?.elementFromPoint(at.x, at.y);
      if (host == null || target == null) {
        throw new Error('no shadow host or trigger');
      }
      const press = (
        element: Element,
        point: {x: number; y: number},
        button: number,
      ) => {
        const init = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: point.x,
          clientY: point.y,
          button,
          buttons: button === 2 ? 2 : 1,
        };
        element.dispatchEvent(
          new PointerEvent('pointerdown', {...init, pointerType: 'mouse'}),
        );
        element.dispatchEvent(new MouseEvent('mousedown', init));
      };
      press(target, at, 2);
      target.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: at.x,
          clientY: at.y,
          button: 2,
          detail: 1,
        }),
      );
      // The right click's microtasks run, as they do after any event.
      await Promise.resolve();
      await Promise.resolve();
      press(host, outside, 0);
      HTMLElement.prototype.showPopover = show;
      return count;
    },
    {at: trigger, outside: hostPadding},
  );
  expect(shows).toBe(1);
  await expect(page.getByRole('menu')).toBeHidden();
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

  // The tap on the host comes once the presentation has run: until it
  // completes, the layer's input hold (spec:AST-094 FR35) drops every tap.
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map(async animation =>
        animation.finished.then(
          () => undefined,
          () => undefined,
        ),
      ),
    );
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
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
