// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file CodeBlockOverflowStop.a11y.chromium.spec.ts
 * @input Built CodeBlock story and real Chromium layout
 * @output Browser evidence that the code viewport is a Tab stop only while it overflows
 * @position CodeBlock FR8 / AST-025 FR12–FR13 proof over the shared scroll capability
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

const STORY = 'core-codeblock--overflow-stop';
const WIDE = 'const wide = "' + 'x'.repeat(400) + '";';
const TALL = Array.from({length: 40}, (_, i) => `const line${i} = ${i};`).join(
  '\n',
);

async function mount(page: Page) {
  await page.setViewportSize({width: 600, height: 500});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await expect(page.getByRole('group', {name: 'tsx'})).toBeVisible();
}

async function setArgs(page: Page, args: Record<string, unknown>) {
  await page.evaluate(
    async ({storyId, updatedArgs}) =>
      new Promise<void>(resolve => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, handler: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        channel.once('storyRendered', () => resolve());
        channel.emit('updateStoryArgs', {storyId, updatedArgs});
        setTimeout(resolve, 1500);
      }),
    {storyId: STORY, updatedArgs: args},
  );
}

function viewport(page: Page) {
  return page.getByRole('group', {name: 'tsx'});
}

test('a fitting viewport is not a Tab stop', async ({page}) => {
  await mount(page);
  await expect(viewport(page)).not.toHaveAttribute('tabindex', /.*/);
  // Tab from the document start lands on the copy button, never the viewport.
  await page.keyboard.press('Tab');
  const active = await page.evaluate(() =>
    document.activeElement?.getAttribute('role'),
  );
  expect(active).not.toBe('group');
});

test('inline overflow adds the stop; block overflow adds it too', async ({
  page,
}) => {
  await mount(page);
  await setArgs(page, {code: WIDE});
  await expect(viewport(page)).toHaveAttribute('tabindex', '0');
  await expect(viewport(page)).toHaveAttribute(
    'data-scrollable-inline',
    'true',
  );

  await setArgs(page, {code: TALL, maxHeight: 160});
  await expect(viewport(page)).toHaveAttribute('tabindex', '0');
  await expect(viewport(page)).toHaveAttribute('data-scrollable-block', 'true');
});

test('losing overflow removes the stop without moving focus', async ({
  page,
}) => {
  await mount(page);
  await setArgs(page, {code: WIDE});
  await expect(viewport(page)).toHaveAttribute('tabindex', '0');
  await viewport(page).focus();
  await expect(viewport(page)).toBeFocused();

  await setArgs(page, {code: 'const fits = true;'});
  // Focus stays on the element that had it; the stop is gone for the next Tab.
  await expect(viewport(page)).toBeFocused();
  await expect(viewport(page)).toHaveAttribute('tabindex', '-1');
  // Leaving and coming back by keyboard skips it: it is out of the Tab order.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(viewport(page)).not.toBeFocused();
  await expect(viewport(page)).not.toHaveAttribute('tabindex', '0');
});

test('a root height set from outside bounds the viewport, which then scrolls', async ({
  page,
}) => {
  await mount(page);
  // The IDE template's pattern: the block fills a parent of fixed height.
  await setArgs(page, {code: TALL, style: {height: 160}});
  const vp = viewport(page);
  await expect(vp).toHaveAttribute('tabindex', '0');
  await expect(vp).toHaveAttribute('data-scrollable-block', 'true');
  const box = await vp.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(160);
  const scrollable = await vp.evaluate(
    node => node.scrollHeight > node.clientHeight + 1,
  );
  expect(scrollable).toBe(true);
});
