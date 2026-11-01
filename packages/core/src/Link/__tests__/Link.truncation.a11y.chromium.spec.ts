// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * Real-browser evidence for `component:Link` FR6 with `component:Text` FR4: a
 * Link with `maxLines={1}` in a fixed-width line, as an anchor and as a
 * button, stops at the line and its label overflows with an ellipsis. A Link
 * behaves as inline text: it clamps with an ancestor Text, shares its first
 * and last lines in a sentence, keeps the external icon on its last line, and
 * paints the focus outline around a block child (AR5).
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

for (const form of ['anchor', 'button'] as const) {
  test(`a ${form} Link with maxLines={1} truncates inside a fixed-width line`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-link--truncated-in-constrained-line&viewMode=story`,
    );
    const line = page.locator(`[data-truncation-line="${form}"]`);
    await expect(line).toBeVisible();
    const measured = await line.evaluate(el => {
      const root = el.firstElementChild as HTMLElement;
      const label = root.firstElementChild as HTMLElement;
      const style = getComputedStyle(label);
      return {
        tag: root.tagName,
        line: el.getBoundingClientRect().width,
        root: root.getBoundingClientRect().width,
        labelClient: label.clientWidth,
        labelScroll: label.scrollWidth,
        textOverflow: style.textOverflow,
      };
    });
    expect(measured.tag, 'the Link renders its own element').toBe(
      form === 'anchor' ? 'A' : 'BUTTON',
    );
    // The root stops at the line instead of growing to its whole text.
    expect(measured.root).toBeLessThanOrEqual(measured.line + 0.5);
    // The label itself overflows and draws the ellipsis.
    expect(measured.labelScroll).toBeGreaterThan(measured.labelClient);
    expect(measured.textOverflow).toBe('ellipsis');
  });
}

const INLINE_FLOW = 'iframe.html?id=core-link--inline-flow&viewMode=story';

test('a Link inside a two-line Text clamps with that text', async ({page}) => {
  await page.goto(`${storybook.origin}/${INLINE_FLOW}`);
  const host = page.locator('[data-inline-flow="clamp"] .astryx-text').first();
  await expect(host).toBeVisible();
  const lines = await host.evaluate(el => {
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    return Math.round(el.getBoundingClientRect().height / lineHeight);
  });
  expect(lines).toBe(2);
});

test('a wrapping Link shares its first and last lines with the sentence', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/${INLINE_FLOW}`);
  const sentence = page.locator('[data-inline-flow="sentence"]');
  await expect(sentence).toBeVisible();
  const measured = await sentence.evaluate(el => {
    const link = el.querySelector('a') as HTMLElement;
    const range = document.createRange();
    const text = el.querySelector('.astryx-text') as HTMLElement;
    // "Written by" and "· example.com" are the text nodes around the link.
    const before = text.firstChild as Text;
    const after = text.lastChild as Text;
    range.selectNodeContents(before);
    const beforeTop = range.getClientRects()[0].top;
    // Where the trailing text starts, so a font that wraps "example.com"
    // itself onto a further line does not matter.
    range.selectNodeContents(after);
    const afterTop = range.getClientRects()[0].top;
    const linkRects = Array.from(link.getClientRects());
    return {
      pieces: linkRects.length,
      linkFirstTop: linkRects[0].top,
      linkLastTop: linkRects[linkRects.length - 1].top,
      beforeTop,
      afterTop,
    };
  });
  expect(measured.pieces, 'the link wraps in pieces').toBeGreaterThan(1);
  expect(Math.abs(measured.linkFirstTop - measured.beforeTop)).toBeLessThan(2);
  expect(Math.abs(measured.linkLastTop - measured.afterTop)).toBeLessThan(2);
});

test("an external Link's icon stays on its last line", async ({page}) => {
  await page.goto(`${storybook.origin}/${INLINE_FLOW}`);
  const external = page.locator('[data-inline-flow="external"] a');
  await expect(external).toBeVisible();
  const measured = await external.evaluate(link => {
    const icon = link.querySelector('svg') as SVGElement;
    const label = link.querySelector('.astryx-text') as HTMLElement;
    const labelRects = Array.from(label.getClientRects());
    const lastLine = labelRects[labelRects.length - 1];
    const iconBox = icon.getBoundingClientRect();
    return {
      labelPieces: labelRects.length,
      lastLineTop: lastLine.top,
      lastLineBottom: lastLine.bottom,
      iconMiddle: (iconBox.top + iconBox.bottom) / 2,
    };
  });
  expect(measured.labelPieces).toBeGreaterThan(1);
  expect(measured.iconMiddle).toBeGreaterThan(measured.lastLineTop);
  expect(measured.iconMiddle).toBeLessThan(measured.lastLineBottom);
});

for (const slot of [
  'block-child',
  'clamped-text-child',
  'block-text-child',
  'span-stack-child',
] as const) {
  test(`keyboard focus paints the outline around a Link with a ${slot}`, async ({
    page,
  }) => {
    await page.goto(`${storybook.origin}/${INLINE_FLOW}`);
    const link = page.locator(`[data-inline-flow="${slot}"] a`);
    await expect(link).toBeVisible();
    // Tab through the story's links until this one holds focus.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await link.evaluate(el => el === document.activeElement)) {
        break;
      }
    }
    await expect(link).toBeFocused();
    const measured = await link.evaluate(el => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // The block child: the Stack, or the caller's block Text.
      const child = (
        (el.querySelector('.astryx-stack') ??
          el.querySelector('.astryx-text .astryx-text')) as HTMLElement
      ).getBoundingClientRect();
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        pieces: el.getClientRects().length,
        covers:
          box.left <= child.left + 0.5 &&
          box.right >= child.right - 0.5 &&
          box.top <= child.top + 0.5 &&
          box.bottom >= child.bottom - 0.5,
      };
    });
    expect(measured.outlineStyle).not.toBe('none');
    expect(measured.outlineWidth).toBeGreaterThan(0);
    // One box around the whole block, so the outline paints around it.
    expect(measured.pieces).toBe(1);
    expect(measured.covers).toBe(true);
  });
}
