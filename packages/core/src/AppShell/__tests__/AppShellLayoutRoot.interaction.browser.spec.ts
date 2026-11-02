// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AppShellLayoutRoot.interaction.browser.spec.ts
 * @input The `Core/AppShell` Inside Layout Hosts story in a built Storybook:
 *   one shell at the page root, the same shell in a padded Card that clips
 *   overflow, in an outer Layout's content area, and in a Section with
 *   explicit padding.
 * @output Real-browser geometry evidence for `component:AppShell` FR18: inside
 *   a padded Card, a Layout or a Section, the shell's internal Layout stays inside its
 *   root (no overhang), and its header logo, side region and main region sit
 *   at the same offsets from the shell's root as at the page root, at desktop
 *   and phone widths.
 * @position Cross-browser proof; jsdom has no layout, so AppShell.test.tsx
 *   can only compare the reset values and markup.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer | undefined;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-appshell--inside-layout-hosts';

interface ShellGeometry {
  overhang: {left: number; top: number; right: number; bottom: number};
  offsets: Record<string, {left: number; top: number} | null>;
}

/** Offsets from the shell's root of its regions, and its Layout's overhang. */
async function measure(page: Page, testId: string): Promise<ShellGeometry> {
  return page.evaluate(id => {
    const shell = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (shell == null) {
      throw new Error(`no shell ${id}`);
    }
    const root = shell.getBoundingClientRect();
    const layout = shell.querySelector<HTMLElement>('.astryx-layout');
    if (layout == null) {
      throw new Error(`no layout in ${id}`);
    }
    const inner = layout.getBoundingClientRect();
    const offset = (element: Element | null) => {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left - root.left),
        top: Math.round(rect.top - root.top),
      };
    };
    return {
      overhang: {
        left: Math.round(root.left - inner.left),
        top: Math.round(root.top - inner.top),
        right: Math.round(inner.right - root.right),
        bottom: Math.round(inner.bottom - root.bottom),
      },
      offsets: {
        logo: offset(shell.querySelector('.astryx-nav-icon')),
        side: offset(shell.querySelector('.astryx-side-nav')),
        main: offset(shell.querySelector('main')),
      },
    };
  }, testId);
}

for (const viewport of [
  {width: 1280, height: 1400},
  {width: 390, height: 1400},
]) {
  test(`lays out inside a padded Card and a Layout as at the page root at ${viewport.width}px (FR18)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      `${storybook?.origin}/iframe.html?id=${STORY}&viewMode=story`,
    );
    await expect(page.getByTestId('shell-in-layout')).toBeVisible();

    const atRoot = await measure(page, 'shell-root');
    expect(atRoot.overhang, 'page root').toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    for (const host of [
      'shell-in-card',
      'shell-in-layout',
      'shell-in-section',
    ]) {
      const inHost = await measure(page, host);
      expect(inHost.overhang, `${host}: Layout overhang`).toEqual(
        atRoot.overhang,
      );
      expect(inHost.offsets, `${host}: region offsets`).toEqual(atRoot.offsets);
    }
  });
}
