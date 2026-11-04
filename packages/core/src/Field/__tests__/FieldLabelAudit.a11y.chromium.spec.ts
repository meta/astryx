// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit FieldLabel

/**
 * @file FieldLabelAudit.a11y.chromium.spec.ts
 * @input Exact-head FieldLabel story across semantics, themes, direction, and viewport sizes
 * @output Screenshots and fail-closed sensor receipts for the FieldLabel whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a FieldLabel audit pull request
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

const OUTPUT = path.resolve('field-label-audit-evidence');
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 900};

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

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('default');
addPair('custom-theme', {theme: 'butter'});
addPair('rtl', {direction: 'rtl'});
addPair('narrow', {viewport: NARROW});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-fieldlabel--states&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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

    const targets = page.locator('.astryx-field-label');
    await expect(targets).toHaveCount(7);
    await expect(page.locator('label[for="field-label-default"]')).toHaveText(
      'Email',
    );
    const description = page.locator('#field-label-description-help');
    await expect(description).toHaveText(
      'Shown in navigation and invitations.',
    );
    await expect(description.locator('xpath=ancestor::label')).toHaveCount(0);
    await expect(page.locator('#field-label-group-label')).toHaveJSProperty(
      'tagName',
      'SPAN',
    );
    await expect(
      page.getByRole('radiogroup', {name: 'Visibility'}),
    ).toBeVisible();
    await expect(page.getByText(/Required/)).toBeVisible();
    await expect(page.getByText(/Optional/)).toBeVisible();
    await expect(page.getByLabel('Search')).toBeVisible();
    const tooltipAnchor = page
      .locator('label[for="field-label-optional"] [aria-describedby]')
      .first();
    await expect(tooltipAnchor).toHaveCount(1);

    await settle(page);
    const observed = await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll<HTMLElement>('.astryx-field-label'),
      ).map(label => {
        const style = getComputedStyle(label);
        const box = label.getBoundingClientRect();
        return {
          text: label.textContent?.replace(/\s+/g, ' ').trim(),
          tagName: label.tagName,
          htmlFor: label.getAttribute('for'),
          color: style.color,
          cursor: style.cursor,
          geometry: {x: box.x, y: box.y, width: box.width, height: box.height},
        };
      });
      const hidden = document.querySelector<HTMLElement>(
        'label[for="field-label-hidden"]',
      );
      const hiddenBox = hidden?.getBoundingClientRect();
      const firstLabel = document.querySelector<HTMLElement>(
        '.astryx-field-label',
      );
      const currentTooltipAnchor = document.querySelector<HTMLElement>(
        'label[for="field-label-optional"] [aria-describedby]',
      );
      return {
        theme: document
          .querySelector('[data-astryx-theme]')
          ?.getAttribute('data-astryx-theme'),
        mode: document.documentElement.getAttribute('data-theme'),
        direction: firstLabel ? getComputedStyle(firstLabel).direction : null,
        viewport: {width: innerWidth, height: innerHeight},
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth + 1,
        fonts: document.fonts.status,
        labels,
        hiddenGeometry: hiddenBox
          ? {width: hiddenBox.width, height: hiddenBox.height}
          : null,
        tooltipAnchor: currentTooltipAnchor
          ? {
              ariaHidden: currentTooltipAnchor.getAttribute('aria-hidden'),
              ariaLabel: currentTooltipAnchor.getAttribute('aria-label'),
              describedBy:
                currentTooltipAnchor.getAttribute('aria-describedby'),
              tabIndex: currentTooltipAnchor.getAttribute('tabindex'),
            }
          : null,
      };
    });

    const semanticsPass =
      observed.labels.length === 7 &&
      observed.labels.filter(label => label.tagName === 'SPAN').length === 1 &&
      observed.labels.every(label => label.geometry.width > 0) &&
      observed.hiddenGeometry?.width === 1 &&
      observed.hiddenGeometry.height === 1;
    const knownTooltipGapObserved =
      observed.tooltipAnchor?.ariaHidden === 'true' &&
      observed.tooltipAnchor.ariaLabel == null &&
      observed.tooltipAnchor.tabIndex == null;

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: 'core-fieldlabel--states',
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        targetCount: 7,
        groupLabelTag: 'SPAN',
        hiddenGeometry: {width: 1, height: 1},
        knownGap:
          'the tooltip anchor is anonymous and nonfocusable on this audited head',
      },
      observed: {
        build: storybookSha,
        ...observed,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      checks: {semanticsPass, knownTooltipGapObserved},
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
        semanticsPass,
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
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/FieldLabel',
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
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => receipt.expected),
  ).toEqual([]);
});
