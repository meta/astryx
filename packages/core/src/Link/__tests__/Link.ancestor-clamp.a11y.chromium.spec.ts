// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * Real-browser evidence for the ancestor clamp split: a text-only Link inside
 * `<Text maxLines={2}>` participates in the clamped lines, while a composed
 * Link keeps its inline-flex root and paints a keyboard focus outline.
 */

import {expect, test} from '@playwright/test';
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

test.afterAll(async () => storybook?.close());

test('a text-only Link clamps inside an ancestor Text maxLines={2}', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-link--clamped-by-ancestor-text&viewMode=story`,
  );
  const paragraph = page.getByTestId('ancestor-clamp-text');
  await expect(paragraph).toBeVisible();
  const measured = await paragraph.evaluate(el => {
    const root = el as HTMLElement;
    const anchor = root.querySelector('a') as HTMLElement | null;
    if (!anchor) {
      return null;
    }
    const anchorBox = anchor.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const rootStyle = getComputedStyle(root) as CSSStyleDeclaration & {
      webkitLineClamp?: string;
    };
    return {
      display: getComputedStyle(anchor).display,
      clamp: rootStyle.webkitLineClamp,
      rootHeight: rootBox.height,
      anchorHeight: anchorBox.height,
      overflowed: root.scrollHeight > root.clientHeight + 1,
    };
  });
  expect(measured).not.toBeNull();
  // The anchor flows inside the clamped lines rather than forming its own box.
  expect(measured?.display).toBe('inline');
  // The ancestor clamps to two lines and the link is cut by that clamp,
  // not overflowing past it.
  expect(measured?.clamp).toBe('2');
  expect(measured?.overflowed).toBe(true);
  expect(measured?.anchorHeight).toBeLessThanOrEqual(
    (measured?.rootHeight ?? 0) + 1,
  );
});

test('a composed Link keeps its box and paints a keyboard focus outline', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-link--clamped-by-ancestor-text&viewMode=story`,
  );
  const link = page.getByTestId('composed-link');
  await expect(link).toBeVisible();
  // The text-only link inside the paragraph is first in tab order; the
  // composed link is the next stop, so keyboard focus reaches it visibly.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();

  const measured = await link.evaluate(el => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      display: style.display,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      height: box.height,
    };
  });
  expect(measured.display).toBe('inline-flex');
  expect(measured.outlineStyle).not.toBe('none');
  expect(parseFloat(measured.outlineWidth)).toBeGreaterThan(0);
});
