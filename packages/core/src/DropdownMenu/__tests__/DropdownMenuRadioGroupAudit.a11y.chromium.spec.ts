// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenuRadioGroup

/**
 * @file DropdownMenuRadioGroupAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuRadioGroup story across themes, modes, direction, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuRadioGroup component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuRadioGroup audit pull request
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

const OUTPUT = path.resolve('dropdown-menu-radio-group-audit-evidence');
const STORY_ID = 'core-dropdownmenuradiogroup--controlled-selection';
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

    const fixture = page.getByTestId('dropdown-menu-radio-group-audit');
    const menu = page.getByRole('menu').last();
    const group = menu.getByRole('group', {name: 'Sort options'});
    await expect(group).toBeVisible();
    const radios = group.getByRole('menuitemradio');
    await expect(radios).toHaveCount(3);
    await expect(fixture).toHaveAttribute('data-close-request-count', '0');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    await radios.nth(1).click();
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(fixture).toHaveAttribute('data-close-request-count', '0');
    await expect(menu).toBeVisible();
    await settle(page);

    const observed = await group.evaluate(element => {
      const currentRadios = Array.from(
        element.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
      );
      const groupStyle = getComputedStyle(element);
      const groupBox = element.getBoundingClientRect();
      const currentMenu = element.closest<HTMLElement>('[role="menu"]');
      const rows = currentRadios.map(row => {
        const box = row.getBoundingClientRect();
        const style = getComputedStyle(row);
        const indicator = row.querySelector<HTMLElement>(
          '.astryx-dropdown-menu-radio',
        );
        const indicatorBox = indicator?.getBoundingClientRect() ?? null;
        return {
          role: row.getAttribute('role'),
          checked: row.getAttribute('aria-checked'),
          text: row.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          color: style.color,
          geometry: {x: box.x, y: box.y, width: box.width, height: box.height},
          indicator:
            indicatorBox === null
              ? null
              : {width: indicatorBox.width, height: indicatorBox.height},
        };
      });
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: groupStyle.direction,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        closeRequestCount:
          element
            .closest('[data-close-request-count]')
            ?.getAttribute('data-close-request-count') ?? null,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        group: {
          role: element.getAttribute('role'),
          ariaLabel: element.getAttribute('aria-label'),
          display: groupStyle.display,
          flexDirection: groupStyle.flexDirection,
          rowGap: groupStyle.rowGap,
          menuRowGap:
            currentMenu === null ? null : getComputedStyle(currentMenu).rowGap,
          geometry: {
            x: groupBox.x,
            y: groupBox.y,
            width: groupBox.width,
            height: groupBox.height,
          },
        },
        rows,
      };
    });

    const semanticsPass =
      observed.group.role === 'group' &&
      observed.group.ariaLabel === 'Sort options' &&
      observed.rows.length === 3 &&
      observed.rows.every(row => row.role === 'menuitemradio') &&
      observed.rows.filter(row => row.checked === 'true').length === 1 &&
      observed.rows[1]?.checked === 'true' &&
      observed.rows[1]?.text?.includes('Oldest first') === true &&
      observed.closeRequestCount === '0';
    const layoutPass =
      observed.group.display === 'flex' &&
      observed.group.flexDirection === 'column' &&
      observed.group.menuRowGap !== null &&
      observed.group.rowGap === observed.group.menuRowGap &&
      Number.parseFloat(observed.group.rowGap) > 0 &&
      observed.group.geometry.width > 0 &&
      observed.group.geometry.height > 0 &&
      observed.rows.every(
        row => row.geometry.width > 0 && row.geometry.height > 0,
      ) &&
      (observed.rows[1]?.geometry.y ?? 0) >
        (observed.rows[0]?.geometry.y ?? Number.POSITIVE_INFINITY);
    const paintPass = observed.rows.every(
      row =>
        row.color !== 'rgba(0, 0, 0, 0)' &&
        row.indicator !== null &&
        row.indicator.width > 0 &&
        row.indicator.height > 0,
    );

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
      observed: {build: storybookSha, ...observed, pageErrors},
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {semanticsPass, layoutPass, paintPass},
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
        semanticsPass &&
        layoutPass &&
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

test('manifest is complete', () => {
  const receipts = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/DropdownMenuRadioGroup',
        build: checkoutSha,
        frames: cases.map(item => ({
          key: item.key,
          image: `${item.key}.png`,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(receipts).toHaveLength(cases.length);
});
