// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CommandPaletteInput

/**
 * @file CommandPaletteInputAudit.a11y.chromium.spec.ts
 * @input Exact-head CommandPaletteInput stories across semantic, theme, direction, viewport, and focus states
 * @output Screenshots and fail-closed sensor receipts for the CommandPaletteInput whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a CommandPaletteInput audit pull request
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

const OUTPUT = path.resolve('command-palette-input-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';
type Story = 'standalone' | 'popup-context' | 'aggregate-matrix';
type State = 'rest' | 'keyboard-focus' | 'pointer-focus' | 'context-matrix';

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
};

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  state: State;
  viewport: {width: number; height: number};
};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story: options.story ?? 'standalone',
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      state: options.state ?? 'rest',
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('standalone-rest');
addPair('standalone-keyboard-focus', {state: 'keyboard-focus'});
addPair('standalone-pointer-focus', {state: 'pointer-focus'});
addPair('standalone-keyboard-focus-custom-theme', {
  state: 'keyboard-focus',
  theme: 'butter',
});
addPair('standalone-keyboard-focus-rtl', {
  state: 'keyboard-focus',
  direction: 'rtl',
});
addPair('standalone-keyboard-focus-narrow', {
  state: 'keyboard-focus',
  viewport: NARROW,
});
addPair('popup-rest', {story: 'popup-context'});
addPair('popup-keyboard-focus', {
  story: 'popup-context',
  state: 'keyboard-focus',
});
addPair('popup-pointer-focus', {
  story: 'popup-context',
  state: 'pointer-focus',
});
addPair('context-matrix', {
  story: 'aggregate-matrix',
  state: 'context-matrix',
});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyId(item: AuditCase) {
  return item.story === 'aggregate-matrix'
    ? 'core-commandpalette--audit-matrix'
    : `core-commandpaletteinput--${item.story}`;
}

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${storyId(item)}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

async function focusFromKeyboard(page: Page, input: Locator) {
  await page.keyboard.press('Tab');
  if (!(await input.evaluate(element => element === document.activeElement))) {
    await input.focus();
  }
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(element => element.matches(':focus-visible')),
  ).toBe(true);
}

async function focusFromPointer(input: Locator) {
  // PopupContext is already focused by Dialog's open-time focus management.
  // Move focus away first so the click acquires focus and runs the component's
  // pointer-modality gate rather than merely clicking an existing keyboard focus.
  await input.blur();
  await expect(input).not.toBeFocused();
  await input.click();
  await expect(input).toBeFocused();
  // CSS Selectors 4 deliberately keeps text-entry controls focus-visible after
  // a pointer click. The component's shared modality gate must still withhold
  // its keyboard-only ring.
  expect(
    await input.evaluate(element => element.matches(':focus-visible')),
  ).toBe(true);
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

    let input: Locator;
    if (item.story === 'aggregate-matrix') {
      const matrix = page.locator('[data-command-palette-audit-matrix]');
      await expect(matrix).toBeVisible();
      await expect(matrix.getByRole('combobox')).toHaveCount(3);
      await expect(matrix.locator('.astryx-spinner')).toHaveCount(1);
      await expect(matrix.getByRole('option')).not.toHaveCount(0);
      input = matrix
        .getByRole('region', {name: 'Grouped command palette'})
        .getByRole('combobox');
    } else if (item.story === 'popup-context') {
      input = page.getByRole('combobox', {name: 'Search commands'});
      await expect(input).toHaveAttribute('aria-expanded', 'true');
      await expect(input).toHaveAttribute('aria-controls', /.+/);
    } else {
      input = page.getByRole('searchbox', {name: 'Search documentation'});
      await expect(input).not.toHaveAttribute('aria-expanded');
      await expect(input).not.toHaveAttribute('aria-controls');
      await expect(page.getByTestId('input-end-content')).toBeVisible();
    }

    await expect(input).toBeVisible();
    if (item.state === 'keyboard-focus') {
      await focusFromKeyboard(page, input);
    } else if (item.state === 'pointer-focus') {
      await focusFromPointer(input);
    }
    await settle(page);

    const inputBox = await input.boundingBox();
    if (inputBox == null) {
      throw new Error(`${item.key}: the visible input has no geometry`);
    }
    const observed = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction: getComputedStyle(
        document.querySelector('.astryx-command-palette-input') as HTMLElement,
      ).direction,
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
    }));
    const focus = await input.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        focused: element === document.activeElement,
        focusVisible: element.matches(':focus-visible'),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
      };
    });
    const ringVisible =
      focus.outlineStyle !== 'none' &&
      Number.parseFloat(focus.outlineWidth) >= 2;
    const focusIndicatorPass =
      item.state === 'keyboard-focus'
        ? focus.focused && focus.focusVisible && ringVisible
        : item.state === 'pointer-focus'
          ? focus.focused && focus.focusVisible && !ringVisible
          : true;

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: storyId(item),
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        viewport: item.viewport,
      },
      observed: {
        build: storybookSha,
        ...observed,
        role: await input.getAttribute('role'),
        name: await input.getAttribute('aria-label'),
        geometry: inputBox,
        focus,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {focusIndicatorPass},
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
        focusIndicatorPass,
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
  const receiptFiles = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  const receipts = receiptFiles.map(
    (file): AuditReceipt =>
      JSON.parse(
        fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
      ) as AuditReceipt,
  );
  const manifest = {
    schemaVersion: 1,
    component: 'core/CommandPaletteInput',
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
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => receipt.expected),
  ).toEqual([]);
});
