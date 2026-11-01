// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit DrawerHeader

/**
 * @file DrawerHeaderAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/DrawerHeader Storybook fixture in light/dark, neutral/custom themes, LTR/RTL, wide/narrow, rest/focus states
 * @output Bounded screenshots and fail-closed sensor receipts for the DrawerHeader whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a DrawerHeader component-audit pull request
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

const OUTPUT = path.resolve('test-results/drawer-header-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type State = 'rest' | 'focus';

type Case = {
  key: string;
  story: 'audit' | 'audit-without-close';
  hasClose: boolean;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  state: State;
  viewport: {width: number; height: number};
};

const cases: Case[] = [];
function addPair(
  key: string,
  options: Partial<Omit<Case, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story: options.story ?? 'audit',
      hasClose: options.hasClose ?? true,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      state: options.state ?? 'rest',
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('rest');
addPair('rest-without-close', {
  story: 'audit-without-close',
  hasClose: false,
});
addPair('rest-custom-theme', {theme: 'butter'});
addPair('rest-rtl', {direction: 'rtl'});
addPair('rest-narrow', {viewport: NARROW});
addPair('focus', {state: 'focus'});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: Case) {
  return `${server.origin}/iframe.html?id=core-drawerheader--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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

    const drawer = page.locator('dialog.astryx-drawer:visible');
    await expect(drawer).toHaveCount(1);
    await settle(page);

    const close = page.getByRole('button', {name: 'Close', exact: true});
    if (item.hasClose) {
      await expect(close).toBeVisible();
    } else {
      await expect(close).toHaveCount(0);
    }
    if (item.state === 'focus') {
      await close.focus();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      expect(
        await close.evaluate(element => element.matches(':focus-visible')),
      ).toBe(true);
    }

    const header = page.locator('.astryx-drawer-header');
    const startSlot = page.locator('.astryx-drawer-header-start-content');
    const titleBlock = page.locator('.astryx-drawer-header-title-block');
    const endSlot = page.locator('.astryx-drawer-header-end-content');
    await expect(header).toHaveCount(1);
    await expect(startSlot).toHaveCount(1);
    await expect(titleBlock).toHaveCount(1);
    await expect(endSlot).toHaveCount(1);
    await expect(startSlot).toHaveText('0');
    await expect(endSlot).toContainText('0');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Deployment health for web-prod-04',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('us-east-1, deployed 12 minutes ago', {exact: true}),
    ).toBeVisible();

    const [headerBox, startBox, titleBox, endBox, closeBox] = await Promise.all(
      [
        header.boundingBox(),
        startSlot.boundingBox(),
        titleBlock.boundingBox(),
        endSlot.boundingBox(),
        item.hasClose ? close.boundingBox() : Promise.resolve(null),
      ],
    );
    if (
      headerBox == null ||
      startBox == null ||
      titleBox == null ||
      endBox == null ||
      (item.hasClose && closeBox == null)
    ) {
      throw new Error(
        `${item.key}: a visible DrawerHeader part has no geometry`,
      );
    }
    const observed = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: getComputedStyle(
        document.querySelector('.astryx-drawer-header') as Element,
      ).direction,
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
    }));

    expect(pageErrors).toEqual([]);
    expect(observed.theme).toBe(item.theme);
    expect(observed.mode).toBe(item.mode);
    expect(observed.direction).toBe(item.direction);
    expect(observed.viewport).toEqual(item.viewport);
    expect(observed.reducedMotion).toBe(true);
    expect(observed.horizontalOverflow).toBe(false);
    expect(observed.fonts).toBe('loaded');
    expect(headerBox.width).toBeGreaterThan(0);
    if (closeBox != null) {
      expect(closeBox.width).toBeGreaterThanOrEqual(24);
      expect(closeBox.height).toBeGreaterThanOrEqual(24);
    }
    if (item.direction === 'ltr') {
      expect(startBox.x).toBeLessThan(titleBox.x);
      expect(titleBox.x).toBeLessThan(endBox.x);
    } else {
      expect(startBox.x).toBeGreaterThan(titleBox.x);
      expect(titleBox.x).toBeGreaterThan(endBox.x);
    }

    const png = await page.screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-drawerheader--${item.story}`,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        viewport: item.viewport,
        startContent: '0',
        endContent: '0',
        titleRole: 'heading',
        titleLevel: 2,
        closeName: item.hasClose ? 'Close' : null,
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometry: {
          header: headerBox,
          startSlot: startBox,
          titleBlock: titleBox,
          endSlot: endBox,
          close: closeBox,
        },
        closeFocused: item.hasClose
          ? await close.evaluate(element => element === document.activeElement)
          : false,
        closeFocusVisible: item.hasClose
          ? await close.evaluate(element => element.matches(':focus-visible'))
          : false,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      passed: true,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
  });
}

test('manifest is complete', async () => {
  const receipts = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  expect(receipts).toHaveLength(cases.length);
  const manifest = {
    schemaVersion: 1,
    component: 'core/DrawerHeader',
    build: checkoutSha,
    frames: cases.map(item => ({
      key: item.key,
      image: `${item.key}.png`,
      receipt: `${item.key}.sensors.json`,
    })),
  };
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
});
