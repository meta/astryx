// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AppShellLayoutRoot.interaction.browser.spec.ts
 * @input The `Core/AppShell` Inside Layout Hosts story in a built Storybook,
 *   its `host` arg placing one shell at the page root, in a padded Card that
 *   clips overflow, in an outer Layout's content area, or in a Section with
 *   explicit padding.
 * @output Real-browser geometry evidence for `component:AppShell` FR18: inside
 *   a padded Card, a Layout or a Section, the shell's internal Layout stays inside its
 *   root (no overhang), and its header logo, side region and main region sit
 *   at the same offsets from the shell's root as at the page root, at desktop
 *   and phone widths.
 * @position Cross-browser proof; jsdom has no layout, so AppShell.test.tsx
 *   can only compare the reset values and markup.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-appshell--inside-layout-hosts';

interface ShellGeometry {
  host: string;
  overhang: {left: number; top: number; right: number; bottom: number};
  offsets: Record<string, {left: number; top: number} | null>;
}

/**
 * Puts the shell in `host` by changing the story's arg in place. It resolves
 * once the shell sits in that host and Storybook has finished the render. A
 * page load per host parses the whole preview again. On a loaded machine, four
 * of them ran past the test's timeout.
 */
async function showIn(page: Page, host: string): Promise<void> {
  await page.evaluate(
    ({storyId, updatedArgs}) => {
      (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
        storyId,
        updatedArgs,
      });
    },
    {storyId: STORY, updatedArgs: {host}},
  );
  await page.waitForFunction(
    ({storyId, expected}) => {
      const shell = document.querySelector('[data-testid="shell"]');
      const parent = shell?.parentElement;
      const shown =
        parent == null
          ? null
          : parent.closest('.astryx-card') != null
            ? 'card'
            : parent.closest('.astryx-layout') != null
              ? 'layout'
              : parent.closest('.astryx-section') != null
                ? 'section'
                : 'root';
      const render = (
        globalThis as unknown as {
          __STORYBOOK_PREVIEW__?: {
            currentRender?: {readonly id?: string; readonly phase?: string};
          };
        }
      ).__STORYBOOK_PREVIEW__?.currentRender;
      return (
        shown === expected &&
        render?.id === storyId &&
        render.phase === 'finished'
      );
    },
    {storyId: STORY, expected: host},
  );
}

/** Offsets from the shell's root of its regions, and its Layout's overhang. */
async function measure(page: Page): Promise<ShellGeometry> {
  await expect(page.getByTestId('shell')).toBeVisible();
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="shell"]');
    if (shell == null) {
      throw new Error('no shell');
    }
    const root = shell.getBoundingClientRect();
    const layout = shell.querySelector<HTMLElement>('.astryx-layout');
    if (layout == null) {
      throw new Error('no layout in the shell');
    }
    const parent = shell.parentElement;
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
      host:
        parent?.closest('.astryx-card') != null
          ? 'card'
          : parent?.closest('.astryx-layout') != null
            ? 'layout'
            : parent?.closest('.astryx-section') != null
              ? 'section'
              : 'root',
      overhang: {
        left: Math.round(root.left - inner.left),
        top: Math.round(root.top - inner.top),
        right: Math.round(inner.right - root.right),
        bottom: Math.round(inner.bottom - root.bottom),
      },
      offsets: {
        logo: offset(shell.querySelector('.astryx-nav-icon')),
        side: offset(shell.querySelector('.astryx-side-nav')),
        main: offset(shell.querySelector('[role="main"]')),
      },
    };
  });
}

for (const viewport of [
  {width: 1280, height: 1400},
  {width: 390, height: 1400},
]) {
  test(`lays out inside a padded Card and a Layout as at the page root at ${viewport.width}px (FR18)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openStory(page, storybook(), STORY, {host: 'root'});
    const atRoot = await measure(page);
    expect(atRoot.host).toBe('root');
    expect(atRoot.overhang, 'page root').toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    for (const host of ['card', 'layout', 'section']) {
      await showIn(page, host);
      const inHost = await measure(page);
      expect(inHost.host).toBe(host);
      expect(inHost.overhang, `${host}: Layout overhang`).toEqual(
        atRoot.overhang,
      );
      expect(inHost.offsets, `${host}: region offsets`).toEqual(atRoot.offsets);
    }
  });
}
