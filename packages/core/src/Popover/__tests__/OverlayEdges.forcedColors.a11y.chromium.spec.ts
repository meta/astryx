// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file OverlayEdges.forcedColors.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the static Storybook server, and the
 *   checked-in DropdownMenu, ContextMenu, Dialog, AlertDialog and Popover
 *   stories, in real Chromium with `forcedColors` emulated
 * @output Computed-border evidence that each floating surface keeps a visible
 *   edge when the platform drops its box-shadow
 * @position The half of the forced-colors contract jsdom cannot honestly reach:
 *   jsdom has no `forced-colors` media feature, so only a browser can say what
 *   border a surface computes there. WCAG 1.4.11 (non-text contrast).
 *
 * These surfaces separate themselves from the page with a box-shadow and have
 * no border. Forced colors drops box-shadow, so without a border the surface
 * runs straight into whatever is under it.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function open(
  page: Page,
  storyId: string,
  forcedColors: 'active' | 'none',
): Promise<void> {
  await page.emulateMedia({forcedColors, reducedMotion: 'reduce'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  // The emulation is only evidence if the page really is in forced colors.
  expect(
    await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
  ).toBe(forcedColors === 'active');
}

function trigger(page: Page): Locator {
  return page.locator('#storybook-root').getByRole('button').first();
}

/** The computed border width and style of every side of `target`. */
async function edgesOf(target: Locator) {
  return target.evaluate(element => {
    const computed = getComputedStyle(element);
    return (['Top', 'Right', 'Bottom', 'Left'] as const).map(side => ({
      side,
      width: parseFloat(computed.getPropertyValue(`border-${side}-width`)),
      style: computed.getPropertyValue(`border-${side}-style`),
    }));
  });
}

async function expectEdge(target: Locator, name: string): Promise<void> {
  for (const edge of await edgesOf(target)) {
    expect(edge.style, `${name} ${edge.side} border style`).not.toBe('none');
    expect(edge.style, `${name} ${edge.side} border style`).not.toBe('hidden');
    expect(
      edge.width,
      `${name} ${edge.side} border width`,
    ).toBeGreaterThanOrEqual(1);
  }
}

async function expectNoEdge(target: Locator, name: string): Promise<void> {
  for (const edge of await edgesOf(target)) {
    expect(edge.width, `${name} ${edge.side} border width`).toBe(0);
  }
}

/** Each surface: how a story reaches it open, and the element that paints it. */
interface Surface {
  readonly name: string;
  readonly storyId: string;
  readonly reveal: (page: Page) => Promise<void>;
  readonly surface: (page: Page) => Locator;
}

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'DropdownMenu',
    storyId: 'core-dropdownmenu--default',
    reveal: async page => {
      await trigger(page).click();
    },
    // The menu sits inside the popover layer that paints the surface.
    surface: page =>
      page
        .locator('.astryx-dropdown-menu')
        .first()
        .locator(
          'xpath=ancestor-or-self::*[contains(@class,"astryx-popover")][1]',
        ),
  },
  {
    name: 'DropdownMenu submenu flyout',
    storyId: 'core-dropdownmenu--submenu',
    reveal: async page => {
      await trigger(page).click();
      await page.getByRole('menuitem', {name: 'Move to'}).hover();
      await page
        .getByRole('menuitem', {name: 'Folder A'})
        .waitFor({state: 'visible'});
    },
    surface: page =>
      page
        .getByRole('menuitem', {name: 'Folder A'})
        .locator(
          'xpath=ancestor::*[contains(@class,"astryx-dropdown-menu")][1]',
        ),
  },
  {
    name: 'ContextMenu',
    storyId: 'core-contextmenu--default',
    reveal: async page => {
      await page.getByText('Right-click this area').click({button: 'right'});
    },
    surface: page => page.locator('.astryx-context-menu').first(),
  },
  {
    name: 'Dialog',
    storyId: 'core-dialog--default',
    reveal: async page => {
      await trigger(page).click();
    },
    surface: page => page.locator('dialog.astryx-dialog[open]').first(),
  },
  {
    name: 'AlertDialog',
    storyId: 'core-alertdialog--delete',
    reveal: async page => {
      await trigger(page).click();
    },
    surface: page => page.locator('dialog.astryx-alert-dialog[open]').first(),
  },
  {
    name: 'Popover',
    storyId: 'core-popover--default',
    reveal: async page => {
      await trigger(page).click();
    },
    surface: page => page.locator('.astryx-popover').first(),
  },
];

test.describe('floating surfaces in forced colors', () => {
  for (const entry of SURFACES) {
    test(`${entry.name} surface has a border`, async ({page}) => {
      await open(page, entry.storyId, 'active');
      await entry.reveal(page);
      const surface = entry.surface(page);
      await surface.waitFor({state: 'visible'});
      await expectEdge(surface, entry.name);
    });
  }
});

test('a fullscreen Dialog has no edge to draw and fits the viewport', async ({
  page,
}) => {
  await open(page, 'core-dialog--fullscreen', 'active');
  await trigger(page).click();
  const surface = page.locator('dialog.astryx-dialog[open]').first();
  await surface.waitFor({state: 'visible'});
  await expectNoEdge(surface, 'fullscreen Dialog');
  const fits = await page.evaluate(() => {
    const box = document.querySelector('dialog[open]')!.getBoundingClientRect();
    return (
      box.width <= window.innerWidth &&
      document.documentElement.scrollWidth <= window.innerWidth
    );
  });
  expect(fits).toBe(true);
});

test.describe('floating surfaces outside forced colors', () => {
  for (const entry of SURFACES) {
    test(`${entry.name} surface gains no border`, async ({page}) => {
      await open(page, entry.storyId, 'none');
      await entry.reveal(page);
      const surface = entry.surface(page);
      await surface.waitFor({state: 'visible'});
      await expectNoEdge(surface, entry.name);
    });
  }
});
