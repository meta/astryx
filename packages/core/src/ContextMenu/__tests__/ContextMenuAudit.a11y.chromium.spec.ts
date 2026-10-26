// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ContextMenu

/**
 * @file ContextMenuAudit.a11y.chromium.spec.ts
 * @input Exact-head ContextMenu stories across pointer/touch presentation, state, theme, direction, and viewport
 * @output Screenshots and fail-closed sensor receipts for the ContextMenu whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a ContextMenu audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('context-menu-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Surface = 'menu' | 'dialog';
type AuditCase = {
  key: string;
  storyId: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
  surface: Surface;
  triggerText?: string;
  menuName?: string;
  expectedState?: 'default' | 'disabled' | 'sections' | 'selectable';
};

const cases: AuditCase[] = [
  {
    key: 'pointer-neutral-light',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-neutral-dark',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-butter-light',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'light',
    direction: 'ltr',
    theme: 'butter',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-butter-dark',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'dark',
    direction: 'ltr',
    theme: 'butter',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-rtl-light',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'light',
    direction: 'rtl',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-rtl-dark',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'dark',
    direction: 'rtl',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-narrow-light',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'pointer-narrow-dark',
    storyId: 'core-contextmenu--pointer-presentation',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
    surface: 'menu',
    menuName: 'Document actions',
  },
  {
    key: 'disabled-item-light',
    storyId: 'core-contextmenu--with-disabled-items',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'Right-click this area',
    expectedState: 'disabled',
  },
  {
    key: 'sections-dark',
    storyId: 'core-contextmenu--with-sections',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'Right-click for grouped actions',
    expectedState: 'sections',
  },
  {
    key: 'selectable-light',
    storyId: 'core-contextmenu--with-selectable-items',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'Right-click for selectable items',
    expectedState: 'selectable',
  },
  {
    key: 'selectable-dark',
    storyId: 'core-contextmenu--with-selectable-items',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'Right-click for selectable items',
    expectedState: 'selectable',
  },
  {
    key: 'sheet-light',
    storyId: 'core-contextmenu--bottom-sheet-presentation',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
    surface: 'dialog',
  },
  {
    key: 'sheet-dark',
    storyId: 'core-contextmenu--bottom-sheet-presentation',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
    surface: 'dialog',
  },
  {
    key: 'sheet-rtl',
    storyId: 'core-contextmenu--bottom-sheet-presentation',
    mode: 'light',
    direction: 'rtl',
    theme: 'neutral',
    viewport: NARROW,
    surface: 'dialog',
  },
  {
    key: 'inline-light',
    storyId: 'core-contextmenu--inline-trigger',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'T123',
    menuName: 'Task actions',
  },
  {
    key: 'inline-dark',
    storyId: 'core-contextmenu--inline-trigger',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'T123',
    menuName: 'Task actions',
  },
  {
    key: 'scroll-container-light',
    storyId: 'core-contextmenu--in-scroll-container',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
    surface: 'menu',
    triggerText: 'Right-click this area',
  },
];

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${item.storyId}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

async function openSurface(
  page: Page,
  item: AuditCase,
): Promise<{surface: Locator; pointer: {x: number; y: number}}> {
  const trigger =
    item.storyId === 'core-contextmenu--pointer-presentation'
      ? page.getByTestId('pointer-context-menu')
      : item.storyId === 'core-contextmenu--bottom-sheet-presentation'
        ? page.getByTestId('bottom-sheet-context-menu')
        : item.triggerText
          ? page.getByText(item.triggerText, {exact: true}).first()
          : null;
  if (trigger === null) {
    throw new Error(`No trigger configured for ${item.key}`);
  }
  await trigger.scrollIntoViewIfNeeded();
  const triggerBox = await trigger.boundingBox();
  if (triggerBox === null) {
    throw new Error(`Trigger has no rendered box for ${item.key}`);
  }
  const pointer = {
    x: triggerBox.x + Math.min(40, triggerBox.width / 2),
    y: triggerBox.y + Math.min(40, triggerBox.height / 2),
  };
  await page.mouse.click(pointer.x, pointer.y, {button: 'right'});
  const surface =
    item.surface === 'dialog'
      ? page.getByRole('dialog').last()
      : item.menuName
        ? page.getByRole('menu', {name: item.menuName}).last()
        : page.getByRole('menu').last();
  await expect(surface).toBeVisible();
  return {surface, pointer};
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expected = process.env.ASTRYX_HEAD_SHA;
  if (expected && expected !== checkoutSha) {
    throw new Error(
      `checkout ${checkoutSha} does not match expected head ${expected}`,
    );
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const response = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!response.ok) {
    throw new Error(`Storybook build has no SHA stamp (${response.status})`);
  }
  storybookSha = (await response.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      `Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
});

test.afterAll(async () => {
  await server?.close();
});

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: item.viewport,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    const {surface, pointer} = await openSurface(page, item);
    await settle(page);

    const menuItems = page.locator(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    );
    if (item.surface === 'menu') {
      await expect(menuItems.first()).toBeVisible();
    } else {
      await expect(surface.getByRole('button').first()).toBeVisible();
    }
    if (item.expectedState === 'disabled') {
      await expect(
        page.locator('[role="menuitem"][aria-disabled="true"]'),
      ).toHaveCount(1);
    }
    if (item.expectedState === 'sections') {
      await expect(page.getByRole('group')).toHaveCount(2);
    }
    if (item.expectedState === 'selectable') {
      await expect(page.getByRole('menuitemcheckbox')).toHaveCount(2);
      await expect(page.getByRole('menuitemradio')).toHaveCount(3);
      await expect(
        page.locator('[role="menuitemradio"][aria-checked="true"]'),
      ).toHaveCount(1);
    }

    const observed = await surface.evaluate(element => {
      const box = element.getBoundingClientRect();
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: getComputedStyle(element).direction,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        surfaceRole:
          element.getAttribute('role') ??
          (element instanceof HTMLDialogElement ? 'dialog' : null),
        surfaceName:
          element.getAttribute('aria-label') ??
          element.getAttribute('aria-labelledby'),
        geometry: {x: box.x, y: box.y, width: box.width, height: box.height},
      };
    });
    const geometryPass =
      observed.geometry !== null &&
      observed.geometry.width > 0 &&
      observed.geometry.height > 0;
    let pointerPlacementPass = true;
    if (item.storyId === 'core-contextmenu--pointer-presentation') {
      const surfaceBox = await surface.boundingBox();
      pointerPlacementPass =
        surfaceBox !== null &&
        Math.abs(
          (item.direction === 'rtl'
            ? surfaceBox.x + surfaceBox.width
            : surfaceBox.x) - pointer.x,
        ) <= 24 &&
        Math.abs(surfaceBox.y - pointer.y) <= 24;
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: item.storyId,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        surface: item.surface,
        state: item.expectedState ?? 'default',
      },
      observed: {
        build: storybookSha,
        ...observed,
        menuItemCount: await menuItems.count(),
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {geometryPass, pointerPlacementPass},
      passed:
        storybookSha === checkoutSha &&
        pageErrors.length === 0 &&
        observed.theme === item.theme &&
        observed.mode === item.mode &&
        observed.direction === item.direction &&
        observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height &&
        observed.reducedMotion &&
        !observed.horizontalOverflow &&
        observed.fonts === 'loaded' &&
        observed.surfaceRole === item.surface &&
        geometryPass &&
        pointerPlacementPass,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    expect(receipt.passed).toBe(true);
    await context.close();
  });
}
