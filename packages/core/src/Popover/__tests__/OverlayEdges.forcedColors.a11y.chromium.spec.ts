// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file OverlayEdges.forcedColors.a11y.chromium.spec.ts
 * @input Uses @playwright/test, the static Storybook server, and the
 *   checked-in DropdownMenu, ContextMenu, Dialog, AlertDialog and Popover
 *   stories, in real Chromium with `forcedColors` emulated
 * @output Computed-edge evidence (a border, or an inset outline) that each
 *   floating surface keeps a visible edge when the platform drops its
 *   box-shadow, and that a capped menu's edge stays inside its viewport gutter
 * @position The half of the forced-colors contract jsdom cannot honestly reach:
 *   jsdom has no `forced-colors` media feature, so only a browser can say what
 *   border a surface computes there. WCAG 1.4.11 (non-text contrast).
 *
 * These surfaces separate themselves from the page with a box-shadow and have
 * no border. Forced colors drops box-shadow, so without a border the surface
 * runs straight into whatever is under it.
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

/**
 * The computed border of every side of `target`, and its outline. A surface
 * draws its forced-colors edge as either one.
 */
async function edgesOf(target: Locator) {
  return target.evaluate(element => {
    const computed = getComputedStyle(element);
    const outlineStyle = computed.getPropertyValue('outline-style');
    const outlineWidth =
      outlineStyle === 'none'
        ? 0
        : parseFloat(computed.getPropertyValue('outline-width'));
    return (['Top', 'Right', 'Bottom', 'Left'] as const).map(side => {
      const style = computed.getPropertyValue(`border-${side}-style`);
      const borderWidth =
        style === 'none' || style === 'hidden'
          ? 0
          : parseFloat(computed.getPropertyValue(`border-${side}-width`));
      return {side, width: Math.max(borderWidth, outlineWidth)};
    });
  });
}

async function expectEdge(target: Locator, name: string): Promise<void> {
  for (const edge of await edgesOf(target)) {
    expect(
      edge.width,
      `${name} ${edge.side} edge width`,
    ).toBeGreaterThanOrEqual(1);
  }
}

async function expectNoEdge(target: Locator, name: string): Promise<void> {
  for (const edge of await edgesOf(target)) {
    expect(edge.width, `${name} ${edge.side} edge width`).toBe(0);
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

test('a capped DropdownMenu keeps its edge inside the 16 px bottom gutter', async ({
  page,
}) => {
  await page.setViewportSize({width: 800, height: 285});
  await open(page, 'core-dropdownmenu--with-sections', 'active');
  await trigger(page).click();
  const surface = page
    .locator('.astryx-dropdown-menu')
    .first()
    .locator('xpath=ancestor-or-self::*[contains(@class,"astryx-popover")][1]');
  await surface.waitFor({state: 'visible'});
  const {bottom, viewport, scrolls} = await surface.evaluate(el => {
    const menu = el.querySelector<HTMLElement>('[role="menu"]');
    return {
      bottom: el.getBoundingClientRect().bottom,
      viewport: window.innerHeight,
      scrolls: menu != null && menu.scrollHeight > menu.clientHeight + 1,
    };
  });
  // The menu is capped by the gutter, so this checks the cap, not its rows.
  expect(scrolls).toBe(true);
  expect(viewport - bottom).toBeGreaterThanOrEqual(16 - 0.5);
});

test('a fullscreen Dialog has no edge to draw and fits the viewport', async ({
  page,
}) => {
  await open(page, 'core-dialog--fullscreen', 'active');
  await trigger(page).click();
  const surface = page.locator('dialog.astryx-dialog[open]').first();
  await surface.waitFor({state: 'visible'});
  await expectNoEdge(surface, 'fullscreen Dialog');
  const fits = await surface.evaluate(dialog => {
    const box = dialog.getBoundingClientRect();
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
