// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * Real-browser evidence for the ancestor clamp split: a text-only Link inside
 * `<Text maxLines={2}>` participates in the clamped lines, a Link inside a
 * one- or two-line clamp shows the top and bottom edges of its keyboard focus
 * ring inside the clamp, and a composed Link keeps its inline-flex root and paints a keyboard
 * focus outline.
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

/** The painted color at one viewport point, read from a real screenshot. */
async function pixel(page: Page, x: number, y: number) {
  const shot = await page.screenshot({clip: {x, y, width: 1, height: 1}});
  return page.evaluate(async base64 => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext(
      '2d',
    ) as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as const;
  }, shot.toString('base64'));
}

for (const [testId, tabs] of [
  ['ancestor-clamp-text', 1],
  ['ancestor-clamp-one-line', 2],
] as const) {
  test(`${testId}: a Link inside the clamp shows the top and bottom edges of its keyboard focus ring`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-link--clamped-by-ancestor-text&viewMode=story`,
    );
    const link = page.getByTestId(testId).locator('a');
    await expect(link).toBeVisible();
    for (let i = 0; i < tabs; i++) {
      await page.keyboard.press('Tab');
    }
    await expect(link).toBeFocused();
    const ring = await link.evaluate(el => {
      const style = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.color = style.outlineColor;
      document.body.append(probe);
      const color = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number);
      probe.remove();
      const line = el.getClientRects()[0];
      return {
        style: style.outlineStyle,
        color,
        line: {
          x: line.left + line.width / 2,
          top: line.top,
          bottom: line.bottom,
        },
      };
    });
    expect(ring.style).not.toBe('none');
    // The top and the bottom edge of the link's first line box show the ring:
    // the clamp clips at its line edges, so an outside ring loses them.
    for (const [edge, y] of [
      ['top', ring.line.top + 1],
      ['bottom', ring.line.bottom - 1.5],
    ] as const) {
      const painted = await pixel(page, Math.floor(ring.line.x), Math.floor(y));
      const distance = Math.hypot(
        painted[0] - ring.color[0],
        painted[1] - ring.color[1],
        painted[2] - ring.color[2],
      );
      expect(distance, `${edge} edge`).toBeLessThan(40);
    }
  });
}

test('a composed Link keeps its box and paints a keyboard focus outline', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-link--clamped-by-ancestor-text&viewMode=story`,
  );
  const link = page.getByTestId('composed-link');
  await expect(link).toBeVisible();
  // The two clamped links come first in tab order; the composed link is the
  // next stop, so keyboard focus reaches it visibly.
  await page.keyboard.press('Tab');
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
