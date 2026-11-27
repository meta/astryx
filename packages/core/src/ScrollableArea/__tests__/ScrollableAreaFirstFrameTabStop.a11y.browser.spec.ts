// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollableAreaFirstFrameTabStop.a11y.browser.spec.ts
 * @input The built Core/CodeBlock "With Max Height" story and the
 *   Core/ScrollableArea "Playground" story with each sticky containment, in
 *   real Chromium and WebKit
 * @output Browser evidence that a viewport which keeps its sticky containment,
 *   and so scrolls from its first frame, is a tab stop in the commit that
 *   mounts it when its content overflows; that a viewport with the default
 *   containment is not a scroller yet then; and that axe reports no
 *   scrollable-region-focusable violation on either
 * @position Browser binding for the shared scroll hook's first measurement;
 *   useScrollableArea.firstFrame.test.tsx proves it against mocked geometry
 */

import AxeBuilder from '@axe-core/playwright';
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

interface MountReading {
  overflowY: string;
  overflows: boolean;
  tabIndex: string | null;
}

/**
 * Opens a story and reads each scroll viewport in the microtask after the
 * commit that inserts it, before the browser lays out the next frame or
 * notifies a resize observer.
 */
async function openReadingMounts(
  page: Page,
  story: string,
  args?: string,
): Promise<MountReading[]> {
  await page.addInitScript(() => {
    const record = window as unknown as {scrollMounts: MountReading[]};
    record.scrollMounts = [];
    const read = (element: Element) => {
      const viewport = element as HTMLElement;
      record.scrollMounts.push({
        overflowY: getComputedStyle(viewport).overflowY,
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
          [
            ...(node.matches('[data-scroll-axis]') ? [node] : []),
            ...node.querySelectorAll('[data-scroll-axis]'),
          ].forEach(read);
        }
      }
    }).observe(document, {childList: true, subtree: true});
  });
  const query = args == null ? '' : `&args=${args}`;
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story${query}`,
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as {scrollMounts: MountReading[]}).scrollMounts
            .length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    () => (window as unknown as {scrollMounts: MountReading[]}).scrollMounts,
  );
}

async function expectNoUnreachableScroller(page: Page) {
  const results = await new AxeBuilder({page})
    .withRules(['scrollable-region-focusable'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.use({viewport: {width: 1024, height: 720}});

test('a CodeBlock whose code overflows is a tab stop in the commit that mounts it', async ({
  page,
}) => {
  const mounts = await openReadingMounts(
    page,
    'core-codeblock--with-max-height',
  );
  const detail = JSON.stringify(mounts);
  const scrolling = mounts.filter(
    mount => mount.overflows && /^(auto|scroll)$/.test(mount.overflowY),
  );
  expect(scrolling.length, detail).toBeGreaterThan(0);
  for (const mount of scrolling) {
    expect(mount.tabIndex, detail).toBe('0');
  }
  await expectNoUnreachableScroller(page);
});

test('a ScrollableArea that keeps its sticky containment is a tab stop in the commit that mounts it when it overflows', async ({
  page,
}) => {
  const mounts = await openReadingMounts(
    page,
    'core-scrollablearea--playground',
    'stickyContainment:always',
  );
  const detail = JSON.stringify(mounts);
  const scrolling = mounts.filter(
    mount => mount.overflows && /^(auto|scroll)$/.test(mount.overflowY),
  );
  expect(scrolling.length, detail).toBeGreaterThan(0);
  for (const mount of scrolling) {
    expect(mount.tabIndex, detail).toBe('0');
  }
  await expectNoUnreachableScroller(page);
});

test('a ScrollableArea with the default containment is no scroller in the commit that mounts it, and a tab stop once it is measured', async ({
  page,
}) => {
  const mounts = await openReadingMounts(
    page,
    'core-scrollablearea--playground',
  );
  const detail = JSON.stringify(mounts);
  for (const mount of mounts) {
    expect(mount.overflowY, detail).toBe('clip');
  }
  const viewport = page.locator('[data-scroll-axis]').first();
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await expectNoUnreachableScroller(page);
});
