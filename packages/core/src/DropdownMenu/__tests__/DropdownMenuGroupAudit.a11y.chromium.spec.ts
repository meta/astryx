// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenuGroup

/**
 * @file DropdownMenuGroupAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuGroup story across themes, color modes, direction, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuGroup component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuGroup audit pull request
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

const OUTPUT = path.resolve('dropdown-menu-group-audit-evidence');
const STORY_ID = 'core-dropdownmenugroup--named-and-unnamed-groups';
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
    const groups = menu.getByRole('group');
    await expect(groups).toHaveCount(2);
    const namedGroup = menu.getByRole('group', {name: 'Version history'});
    const unnamedGroup = groups.nth(1);
    await expect(namedGroup).toBeVisible();
    await expect(unnamedGroup).not.toHaveAttribute('aria-labelledby');
    const heading = namedGroup.getByText('Version history', {exact: true});
    await expect(heading).toBeVisible();
    const headingId = await heading.getAttribute('id');
    if (headingId == null) {
      throw new Error('named group heading has no id');
    }
    await expect(namedGroup).toHaveAttribute('aria-labelledby', headingId);
    await settle(page);

    const menuItems = menu.getByRole('menuitem');
    await expect(menuItems).toHaveCount(3);
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menuItems.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItems.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItems.last()).toBeFocused();
    await page.keyboard.press('v');
    await expect(menuItems.last()).toBeFocused();
    await expect(namedGroup).not.toBeFocused();
    await expect(heading).not.toBeFocused();

    const observed = await namedGroup.evaluate(element => {
      const headingId = element.getAttribute('aria-labelledby');
      const currentHeading = headingId
        ? document.getElementById(headingId)
        : null;
      const groupBox = element.getBoundingClientRect();
      const headingBox = currentHeading?.getBoundingClientRect() ?? null;
      const groupStyle = getComputedStyle(element);
      const headingStyle = currentHeading
        ? getComputedStyle(currentHeading)
        : null;
      const currentMenu = element.closest('[role="menu"]');
      const currentGroups = currentMenu?.querySelectorAll('[role="group"]');
      const currentUnnamed = currentGroups?.item(1) ?? null;
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: groupStyle.direction,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        named: {
          role: element.getAttribute('role'),
          labelledBy: headingId,
          accessibleText: currentHeading?.textContent?.trim() ?? null,
          headingRole: currentHeading?.getAttribute('role') ?? null,
          headingTabIndex: currentHeading?.getAttribute('tabindex') ?? null,
          headingTarget:
            currentHeading?.classList.contains(
              'astryx-dropdown-menu-section-heading',
            ) ?? false,
        },
        unnamed: {
          role: currentUnnamed?.getAttribute('role') ?? null,
          labelledBy: currentUnnamed?.getAttribute('aria-labelledby') ?? null,
          ariaLabel: currentUnnamed?.getAttribute('aria-label') ?? null,
        },
        geometry: {
          group: {
            x: groupBox.x,
            y: groupBox.y,
            width: groupBox.width,
            height: groupBox.height,
          },
          heading:
            headingBox === null
              ? null
              : {
                  x: headingBox.x,
                  y: headingBox.y,
                  width: headingBox.width,
                  height: headingBox.height,
                },
        },
        headingPaint:
          headingStyle === null
            ? null
            : {
                color: headingStyle.color,
                fontFamily: headingStyle.fontFamily,
                fontSize: headingStyle.fontSize,
                lineHeight: headingStyle.lineHeight,
                paddingInlineStart: headingStyle.paddingInlineStart,
                paddingInlineEnd: headingStyle.paddingInlineEnd,
              },
      };
    });

    const semanticsPass =
      observed.named.role === 'group' &&
      observed.named.labelledBy !== null &&
      observed.named.accessibleText === 'Version history' &&
      observed.named.headingRole === null &&
      observed.named.headingTabIndex === null &&
      observed.named.headingTarget &&
      observed.unnamed.role === 'group' &&
      observed.unnamed.labelledBy === null &&
      observed.unnamed.ariaLabel === null;
    const geometryPass =
      observed.geometry.group.width > 0 &&
      observed.geometry.group.height > 0 &&
      observed.geometry.heading !== null &&
      observed.geometry.heading.width > 0 &&
      observed.geometry.heading.height > 0;
    const paintPass =
      observed.headingPaint !== null &&
      observed.headingPaint.color !== 'rgba(0, 0, 0, 0)' &&
      observed.headingPaint.fontSize !== '0px' &&
      observed.headingPaint.lineHeight !== '0px' &&
      observed.headingPaint.paddingInlineStart ===
        observed.headingPaint.paddingInlineEnd;

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
        groupCount: await groups.count(),
        menuItemCount: await menuItems.count(),
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {semanticsPass, geometryPass, paintPass},
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
        (await groups.count()) === 2 &&
        (await menuItems.count()) === 3 &&
        semanticsPass &&
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
