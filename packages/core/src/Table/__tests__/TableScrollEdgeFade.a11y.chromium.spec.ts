// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TableScrollEdgeFade.a11y.chromium.spec.ts
 * @input Built responsive Table story in real Chromium, with a touch pointer
 * @output Browser evidence that the shared edge fade follows the edge state
 *   and leaves the keyboard ring unmasked, in LTR and RTL
 * @position Table integration proof for the shared scroll-edge presenter
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// Phones and tablets overlay their scrollbars, so the fade applies there.
test.use({hasTouch: true, isMobile: true});

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function overflowingTable(
  page: Page,
  direction: 'ltr' | 'rtl' = 'ltr',
): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table--responsive-scroll&viewMode=story&globals=direction:${direction}`,
  );
  const viewport = page.locator('.astryx-table-scroll-wrapper').first();
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  return viewport;
}

async function maskOf(viewport: Locator): Promise<string> {
  return viewport.evaluate(element => getComputedStyle(element).maskImage);
}

async function scrollTo(viewport: Locator, edge: 'start' | 'middle' | 'end') {
  await viewport.evaluate((element: HTMLElement, where) => {
    const max = element.scrollWidth - element.clientWidth;
    const rtl = getComputedStyle(element).direction === 'rtl';
    const offset = where === 'start' ? 0 : where === 'end' ? max : max / 2;
    element.scrollLeft = rtl ? -offset : offset;
  }, edge);
}

for (const dir of ['ltr', 'rtl'] as const) {
  test(`${dir}: an edge fades only while it hides content`, async ({page}) => {
    const viewport = await overflowingTable(page, dir);
    expect(
      await viewport.evaluate(element => getComputedStyle(element).direction),
    ).toBe(dir);

    await scrollTo(viewport, 'start');
    await expect(viewport).toHaveAttribute('data-scroll-inline-start', 'true');
    await expect
      .poll(async () => maskOf(viewport))
      .toContain('linear-gradient');

    await scrollTo(viewport, 'end');
    await expect(viewport).toHaveAttribute('data-scroll-inline-end', 'true');
    await expect
      .poll(async () => maskOf(viewport))
      .toContain('linear-gradient');
  });

  test(`${dir}: a keyboard-focused viewport shows its ring unmasked`, async ({
    page,
  }) => {
    const viewport = await overflowingTable(page, dir);
    expect(
      await viewport.evaluate(element => getComputedStyle(element).direction),
    ).toBe(dir);
    await scrollTo(viewport, 'middle');
    await expect
      .poll(async () => maskOf(viewport))
      .toContain('linear-gradient');

    // A key press first makes the next focus keyboard focus (:focus-visible).
    await page.keyboard.press('Shift');
    await viewport.focus();
    await expect(viewport).toBeFocused();
    expect(
      await viewport.evaluate(element => element.matches(':focus-visible')),
    ).toBe(true);
    await expect.poll(async () => maskOf(viewport)).toBe('none');
  });
}

test('a pinned edge shows its own shadow and no fade, while the other edge fades', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablestickycolumns--pin-start&viewMode=story`,
  );
  const viewport = page.locator('.astryx-table-scroll-wrapper').first();
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  // In the middle both edges hide content; only the unpinned end may fade.
  await scrollTo(viewport, 'middle');
  await expect(viewport).not.toHaveAttribute(
    'data-scroll-inline-start',
    'true',
  );
  await expect(viewport).not.toHaveAttribute('data-scroll-inline-end', 'true');
  await expect.poll(async () => maskOf(viewport)).toContain('linear-gradient');
  const lengths = await viewport.evaluate((element: HTMLElement) => {
    const style = getComputedStyle(element);
    return {
      start: style.getPropertyValue('--_scroll-fade-start-1').trim(),
      end: style.getPropertyValue('--_scroll-fade-end-1').trim(),
    };
  });
  expect(lengths.start).toBe('0px');
  expect(lengths.end).not.toBe('0px');
});
