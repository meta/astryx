// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DropdownMenuItem

/**
 * @file DropdownMenuItemAudit.a11y.chromium.spec.ts
 * @input Exact-head DropdownMenuItem story across states, themes, direction, and viewport widths
 * @output Screenshots and fail-closed sensor receipts for the DropdownMenuItem component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DropdownMenuItem audit pull request
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

const OUTPUT = path.resolve('dropdown-menu-item-audit-evidence');
const STORY_ID = 'core-dropdownmenuitem--item-states';
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Interaction = 'rest' | 'focus' | 'hover';
type AuditCase = {
  key: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  interaction: Interaction;
  viewport: {width: number; height: number};
};

const cases: AuditCase[] = [
  {
    key: 'neutral-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'neutral-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'focus-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'focus',
    viewport: WIDE,
  },
  {
    key: 'focus-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'focus',
    viewport: WIDE,
  },
  {
    key: 'hover-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'hover',
    viewport: WIDE,
  },
  {
    key: 'hover-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'hover',
    viewport: WIDE,
  },
  {
    key: 'butter-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'butter',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'butter-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'butter',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'rtl-light',
    mode: 'light',
    direction: 'rtl',
    theme: 'neutral',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'rtl-dark',
    mode: 'dark',
    direction: 'rtl',
    theme: 'neutral',
    interaction: 'rest',
    viewport: WIDE,
  },
  {
    key: 'narrow-light',
    mode: 'light',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'rest',
    viewport: NARROW,
  },
  {
    key: 'narrow-dark',
    mode: 'dark',
    direction: 'ltr',
    theme: 'neutral',
    interaction: 'rest',
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
    const rows = menu.getByRole('menuitem');
    await expect(rows).toHaveCount(5);
    const defaultRow = page.getByTestId('default-row');
    const supportingRow = page.getByTestId('supporting-row');
    const destructiveRow = page.getByTestId('destructive-row');
    const disabledRow = page.getByTestId('disabled-row');
    const linkRow = page.getByTestId('link-row');
    await expect(disabledRow).toHaveAttribute('aria-disabled', 'true');
    await expect(destructiveRow).toHaveAttribute('data-variant', 'destructive');
    await expect(linkRow).toHaveAttribute('href', '/settings');
    await expect(linkRow).toHaveAttribute('role', 'menuitem');
    await expect(menu.locator('button, [role="button"]')).toHaveCount(0);

    if (item.interaction === 'focus') {
      await defaultRow.focus();
      await expect(defaultRow).toBeFocused();
    } else if (item.interaction === 'hover') {
      await supportingRow.hover();
    }
    await settle(page);

    const observed = await menu.evaluate(element => {
      const currentRows = Array.from(
        element.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      const describe = (row: HTMLElement | undefined) => {
        if (!row) {
          return null;
        }
        const style = getComputedStyle(row);
        const box = row.getBoundingClientRect();
        return {
          tagName: row.tagName,
          classTarget: row.classList.contains('astryx-dropdown-menu-item'),
          role: row.getAttribute('role'),
          disabled: row.getAttribute('aria-disabled'),
          variant: row.getAttribute('data-variant'),
          size: row.getAttribute('data-size'),
          href: row.getAttribute('href'),
          tabIndex: row.getAttribute('tabindex'),
          backgroundColor: style.backgroundColor,
          color: style.color,
          opacity: style.opacity,
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
          geometry: {x: box.x, y: box.y, width: box.width, height: box.height},
        };
      };
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: getComputedStyle(currentRows[0]).direction,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        activeText: document.activeElement?.textContent
          ?.replace(/\s+/g, ' ')
          .trim(),
        rows: currentRows.map(describe),
      };
    });

    const semanticPass =
      observed.rows.length === 5 &&
      observed.rows.every(row => row?.role === 'menuitem' && row.classTarget) &&
      observed.rows[2]?.variant === 'destructive' &&
      observed.rows[3]?.disabled === 'true' &&
      observed.rows[4]?.tagName === 'A' &&
      observed.rows[4]?.href === '/settings' &&
      observed.rows.every(
        row =>
          row !== null && row.geometry.width > 0 && row.geometry.height > 0,
      );
    const paintPass =
      observed.rows[2]?.color !== observed.rows[0]?.color &&
      Number(observed.rows[3]?.opacity ?? 1) < 1;
    const interactionPaintPass =
      item.interaction === 'rest' ||
      (item.interaction === 'focus' &&
        observed.rows[0]?.backgroundColor !==
          observed.rows[1]?.backgroundColor) ||
      (item.interaction === 'hover' &&
        observed.rows[1]?.backgroundColor !==
          observed.rows[0]?.backgroundColor);
    const interactionPass =
      (item.interaction !== 'focus' ||
        observed.activeText?.includes('Edit project')) &&
      interactionPaintPass;

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
        interaction: item.interaction,
        viewport: item.viewport,
      },
      observed: {build: storybookSha, ...observed, pageErrors},
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {
        semanticPass,
        paintPass,
        interactionPaintPass,
        interactionPass,
      },
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
        semanticPass &&
        paintPass &&
        interactionPass,
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
        component: 'core/DropdownMenuItem',
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
