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
      overflowed: root.scrollHeight > root.clientHeight + 1,
      // The clamp cuts the link mid text: the anchor starts inside the two
      // visible lines and its box extends past the visible bottom edge.
      anchorTopInside:
        anchorBox.top >= rootBox.top - 1 && anchorBox.top <= rootBox.bottom - 1,
      anchorBottomPastClamp: anchorBox.bottom > rootBox.bottom + 1,
    };
  });
  expect(measured).not.toBeNull();
  // The anchor flows inside the clamped lines rather than forming its own box.
  expect(measured?.display).toBe('inline');
  // The ancestor clamps to two lines, and the link's own text runs past them
  // so the clamp cuts the link itself, not just the paragraph after it.
  expect(measured?.clamp).toBe('2');
  expect(measured?.overflowed).toBe(true);
  expect(measured?.anchorTopInside).toBe(true);
  expect(measured?.anchorBottomPastClamp).toBe(true);
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
