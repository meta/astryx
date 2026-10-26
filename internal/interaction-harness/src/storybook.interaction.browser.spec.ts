// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file storybook.interaction.browser.spec.ts
 * @input The built Storybook (`withStorybook`) and one of its stories
 * @output `openStory` turns Storybook's highlight module off, so an insertion
 *   in a story carries no `getComputedStyle` scan of the page; with the module
 *   on (the control), every insertion carries one
 * @position Self-test for story.ts; it needs the built Storybook, as every
 *   component proof does
 */

import {expect, test, type Page} from '@playwright/test';
import {openStory, withStorybook} from './story';
import {countBetween, traceRendering} from './trace';

const storybook = withStorybook(test);

/** Counts the page's `getComputedStyle` calls, from before Storybook loads. */
function countStyleReads(): void {
  const w = window as unknown as {__styleReads: number};
  w.__styleReads = 0;
  const read = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    w.__styleReads += 1;
    return read(element, pseudo);
  }) as typeof window.getComputedStyle;
}

/**
 * Inserts an exit copy of the story's first element into `#storybook-root`,
 * as an exit animation's copy is, lets the insertion's mutation microtasks run,
 * and reports what ran between its marks.
 */
async function insertCopy(page: Page) {
  return page.evaluate(async () => {
    const w = window as unknown as {__styleReads: number};
    const root = document.getElementById('storybook-root') as HTMLElement;
    const reads = w.__styleReads;
    const from =
      performance.timeOrigin + performance.mark('copy:start').startTime;
    const copy = (root.firstElementChild as HTMLElement).cloneNode(
      true,
    ) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    root.appendChild(copy);
    // A MutationObserver's callback is a microtask the insertion queued:
    // these run after it.
    await Promise.resolve();
    await Promise.resolve();
    const to = performance.timeOrigin + performance.mark('copy:end').startTime;
    const scanned = w.__styleReads - reads;
    const elements = document.body.querySelectorAll('*').length;
    copy.remove();
    return {from, to, scanned, elements};
  });
}

test("openStory turns Storybook's highlight module off: an insertion in a story carries no getComputedStyle scan of the page", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'rendering traces are Chromium-only (README: engine limits)',
  );
  // The harness default.
  await page.addInitScript(countStyleReads);
  await openStory(page, storybook(), 'core-button--primary');
  expect(await page.locator('#storybook-highlights-root').count()).toBe(0);
  let off = {from: 0, to: 0, scanned: 0, elements: 0};
  const offTrace = await traceRendering(page, async () => {
    off = await insertCopy(page);
  });
  expect(off.scanned).toBe(0);
  expect(countBetween(offTrace, off.from, off.to).UpdateLayoutTree ?? 0).toBe(
    0,
  );

  // Control: Storybook's module kept on reads the style of every element on
  // the page inside the inserting task.
  const control = await page.context().newPage();
  await control.addInitScript(countStyleReads);
  await openStory(control, storybook(), 'core-button--primary', undefined, {
    storybookHighlight: true,
  });
  expect(await control.locator('#storybook-highlights-root').count()).toBe(1);
  let on = {from: 0, to: 0, scanned: 0, elements: 0};
  const onTrace = await traceRendering(control, async () => {
    on = await insertCopy(control);
  });
  expect(on.scanned).toBeGreaterThanOrEqual(on.elements);
  expect(
    countBetween(onTrace, on.from, on.to).UpdateLayoutTree ?? 0,
  ).toBeGreaterThan(0);
  await control.close();
});
