// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScheduleTimeGridAsyncTabStop.a11y.chromium.spec.ts
 * @input The built Lab/Schedule async-loader story in real Chromium, whose
 *   events load 300 ms after it renders
 * @output Browser evidence that every time-grid viewport the story mounts, the
 *   loading fallback's and the loaded content's, is a tab stop in the commit
 *   that mounts it whenever it overflows, and that axe reports no
 *   scrollable-region-focusable violation once the events have loaded
 * @position Browser binding for the Schedule viewport's reachability under
 *   `spec:AST-025` FR12. jsdom proves it against mocked geometry; only a
 *   layout engine shows the viewport that a scan meets as the content lands.
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'lab-schedule--async-loader';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface MountReading {
  overflowY: string;
  overflows: boolean;
  tabIndex: string | null;
}

test('each time-grid viewport is a tab stop in the commit that mounts it, and the loaded story has no unreachable scroller', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  // A mutation record is delivered in the microtask after the commit that
  // inserts the viewport, before the browser lays out the next frame or
  // notifies any resize observer. So it reads the viewport as a scan that
  // runs before the measured scroll state would.
  await page.addInitScript(() => {
    const record = window as unknown as {timeGridMounts: MountReading[]};
    record.timeGridMounts = [];
    const read = (element: Element) => {
      const viewport = element as HTMLElement;
      const style = getComputedStyle(viewport);
      record.timeGridMounts.push({
        overflowY: style.overflowY,
        overflows:
          viewport.scrollHeight > viewport.clientHeight ||
          viewport.scrollWidth > viewport.clientWidth,
        tabIndex: viewport.getAttribute('tabindex'),
      });
    };
    new MutationObserver(records => {
      for (const mutation of records) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          const viewports = [
            ...(node.matches('[role="region"][data-scroll-axis]')
              ? [node]
              : []),
            ...node.querySelectorAll('[role="region"][data-scroll-axis]'),
          ];
          viewports.forEach(read);
        }
      }
    }).observe(document, {childList: true, subtree: true});
  });
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  // The loaded content names its events; the fallback has none.
  await page.locator('.astryx-schedule').waitFor();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as {timeGridMounts: MountReading[]}).timeGridMounts
            .length,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  const mounts = await page.evaluate(
    () =>
      (window as unknown as {timeGridMounts: MountReading[]}).timeGridMounts,
  );
  const scrolling = mounts.filter(
    mount => mount.overflows && /^(auto|scroll)$/.test(mount.overflowY),
  );
  // Both the fallback's viewport and the loaded content's scroll from their
  // first frame in this story.
  expect(scrolling.length, JSON.stringify(mounts)).toBeGreaterThanOrEqual(2);
  for (const mount of scrolling) {
    expect(mount.tabIndex, JSON.stringify(mounts)).toBe('0');
  }

  const results = await new AxeBuilder({page})
    .withRules(['scrollable-region-focusable'])
    .analyze();
  expect(results.violations).toEqual([]);
});
