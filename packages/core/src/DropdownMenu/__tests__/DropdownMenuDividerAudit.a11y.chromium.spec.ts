// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenuDivider

/**
 * @file DropdownMenuDividerAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuDivider story across themes, color modes, direction, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuDivider component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuDivider audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('dropdown-menu-divider-audit-evidence');
const STORY_ID = 'core-dropdownmenudivider--menu-separator';
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type AuditCase = {
  key: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
};

const cases: AuditCase[] = [
  {
    key: 'neutral-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
  },
  {
    key: 'neutral-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: WIDE,
  },
  {
    key: 'butter-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'butter',
    viewport: WIDE,
  },
  {
    key: 'butter-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'butter',
    viewport: WIDE,
  },
  {
    key: 'rtl-light',
    mode: 'light',
    direction: 'rtl',
    theme: 'neutral',
    viewport: WIDE,
  },
  {
    key: 'rtl-dark',
    mode: 'dark',
    direction: 'rtl',
    theme: 'neutral',
    viewport: WIDE,
  },
  {
    key: 'narrow-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
  },
  {
    key: 'narrow-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    viewport: NARROW,
  },
];

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
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
    const menu = page.getByRole('menu').last();
    await expect(menu).toBeVisible();
    const separator = page.getByRole('separator');
    await expect(separator).toBeVisible();
    await expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    await settle(page);

    const menuItems = page.getByRole('menuitem');
    await expect(menuItems).toHaveCount(2);
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menuItems.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItems.last()).toBeFocused();
    await expect(separator).not.toBeFocused();

    const observed = await separator.evaluate(element => {
      const rootBox = element.getBoundingClientRect();
      const rule = element.firstElementChild;
      const ruleBox = rule?.getBoundingClientRect() ?? null;
      const rootStyle = getComputedStyle(element);
      const ruleStyle = rule ? getComputedStyle(rule) : null;
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: rootStyle.direction,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        role: element.getAttribute('role'),
        orientation: element.getAttribute('aria-orientation'),
        tabIndex: element.getAttribute('tabindex'),
        targetClasses: {
          menuDivider: element.classList.contains(
            'astryx-dropdown-menu-divider',
          ),
          divider: element.classList.contains('astryx-divider'),
        },
        geometry: {
          root: {
            x: rootBox.x,
            y: rootBox.y,
            width: rootBox.width,
            height: rootBox.height,
          },
          rule:
            ruleBox === null
              ? null
              : {
                  x: ruleBox.x,
                  y: ruleBox.y,
                  width: ruleBox.width,
                  height: ruleBox.height,
                },
        },
        ruleBackground: ruleStyle?.backgroundColor ?? null,
      };
    });

    const geometryPass =
      observed.geometry.root.width > 0 &&
      observed.geometry.root.height > 0 &&
      observed.geometry.rule !== null &&
      observed.geometry.rule.width > 0 &&
      observed.geometry.rule.height > 0;
    const paintPass =
      observed.ruleBackground !== null &&
      observed.ruleBackground !== 'rgba(0, 0, 0, 0)' &&
      observed.ruleBackground !== 'transparent';
    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: STORY_ID,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
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
      checks: {geometryPass, paintPass},
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
        observed.role === 'separator' &&
        observed.orientation === 'horizontal' &&
        observed.tabIndex === null &&
        observed.targetClasses.menuDivider &&
        observed.targetClasses.divider &&
        geometryPass &&
        paintPass,
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
