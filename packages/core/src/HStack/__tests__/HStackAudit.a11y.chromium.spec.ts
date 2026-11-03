// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit HStack

/**
 * @file HStackAudit.a11y.chromium.spec.ts
 * @input Exact-head HStack alignment matrix across themes, modes, direction, and viewport
 * @output Screenshots and fail-closed sensor receipts for the HStack whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an HStack audit pull request
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

const OUTPUT = path.resolve('hstack-audit-evidence');
const STORY_ID = 'core-hstack--alignment-matrix';
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
  failures: string[];
};

const EXPECTED_CASES = [
  'default',
  'h-end',
  'justify-between',
  'h-wins',
  'v-center',
  'align-end',
  'v-wins',
  'wrap',
];

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
  return `${server.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(40);
}

async function observe(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    function box(element: Element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    const stacks = Array.from(
      document.querySelectorAll<HTMLElement>('[data-audit-case]'),
    ).map(stack => {
      const style = getComputedStyle(stack);
      return {
        auditCase: stack.getAttribute('data-audit-case'),
        tagName: stack.tagName,
        hasTarget: stack.classList.contains('astryx-stack'),
        dataDirection: stack.getAttribute('data-direction'),
        role: stack.getAttribute('role'),
        tabIndex: stack.getAttribute('tabindex'),
        display: style.display,
        flexDirection: style.flexDirection,
        direction: style.direction,
        box: box(stack),
        items: Array.from(stack.children).map(child => box(child)),
      };
    });
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
      runningAnimations: document
        .getAnimations()
        .filter(animation => animation.playState === 'running').length,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      stacks,
    };
  });
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
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    await expect(page.locator('[data-audit-case]')).toHaveCount(
      EXPECTED_CASES.length,
    );

    await settle(page);
    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.stacks.map(stack => stack.items)) ===
      JSON.stringify(observed.stacks.map(stack => stack.items));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number) =>
      Math.abs(actual - expected) <= 1;
    const rtl = item.direction === 'rtl';

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 1, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(observed.runningAnimations === 0, 'animations still running');
    check(geometryStable, 'geometry changed between samples');
    check(!observed.documentOverflow, 'document scrolls horizontally');
    check(
      JSON.stringify(observed.stacks.map(stack => stack.auditCase)) ===
        JSON.stringify(EXPECTED_CASES),
      'audit cases missing or out of order',
    );

    for (const stack of observed.stacks) {
      const id = stack.auditCase ?? 'unknown';
      const {box, items} = stack;
      check(stack.tagName === 'DIV', `${id}: renders ${stack.tagName}`);
      check(stack.hasTarget, `${id}: no astryx-stack target`);
      check(stack.dataDirection === 'horizontal', `${id}: data-direction`);
      check(stack.display === 'flex', `${id}: display ${stack.display}`);
      check(stack.flexDirection === 'row', `${id}: ${stack.flexDirection}`);
      check(stack.direction === item.direction, `${id}: direction`);
      check(
        stack.role == null && stack.tabIndex == null,
        `${id}: adds a role or tab stop`,
      );
      if (items.length === 0) {
        check(false, `${id}: no items`);
        continue;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      // Inline start and end, read in the writing direction.
      const startOf = (rect: typeof box) => (rtl ? rect.right : rect.left);
      const endOf = (rect: typeof box) => (rtl ? rect.left : rect.right);
      const fromStart = (rect: typeof box) =>
        rtl ? box.right - rect.right : rect.left - box.left;
      const fromEnd = (rect: typeof box) =>
        rtl ? rect.left - box.left : box.right - rect.right;

      if (id !== 'wrap') {
        // Items follow the writing direction in one line.
        const inOrder = items.every(
          (rect, index) =>
            index === 0 ||
            (rtl
              ? rect.right <= items[index - 1].left + 0.5
              : rect.left >= items[index - 1].right - 0.5),
        );
        check(inOrder, `${id}: items are not in inline order`);
        check(
          items.every(rect => near(rect.top, firstItem.top)),
          `${id}: items are not on one line`,
        );
      }
      if (id === 'default') {
        check(near(startOf(firstItem), startOf(box)), `${id}: not at start`);
        check(near(firstItem.top, box.top), `${id}: not at the block start`);
        const gaps = items
          .slice(1)
          .map((rect, index) =>
            rtl
              ? items[index].left - rect.right
              : rect.left - items[index].right,
          );
        check(
          gaps.every(value => value > 0 && near(value, gaps[0])),
          `${id}: gaps ${gaps.join(',')}`,
        );
      }
      if (id === 'h-end') {
        check(near(endOf(lastItem), endOf(box)), `${id}: not at the end`);
      }
      if (id === 'justify-between') {
        check(near(startOf(firstItem), startOf(box)), `${id}: first item`);
        check(near(endOf(lastItem), endOf(box)), `${id}: last item`);
      }
      if (id === 'h-wins') {
        check(
          near(fromStart(firstItem), fromEnd(lastItem)),
          `${id}: group is not centered (hAlign did not win)`,
        );
      }
      if (id === 'v-center') {
        check(
          near(firstItem.top - box.top, box.bottom - firstItem.bottom),
          `${id}: items are not centered on the cross axis`,
        );
      }
      if (id === 'align-end') {
        check(near(firstItem.bottom, box.bottom), `${id}: not at block end`);
      }
      if (id === 'v-wins') {
        check(
          near(firstItem.top, box.top),
          `${id}: not at block start (vAlign did not win)`,
        );
      }
      if (id === 'wrap') {
        const rows = new Set(items.map(rect => rect.top));
        check(rows.size > 1, `${id}: items did not wrap`);
        check(
          items.every(
            rect =>
              rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5,
          ),
          `${id}: an item leaves the stack`,
        );
        check(near(startOf(firstItem), startOf(box)), `${id}: not at start`);
      }
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
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
        cases: EXPECTED_CASES,
        layout:
          'every case is a horizontal flex row carrying astryx-stack and data-direction="horizontal" with no role or tab stop; items follow the writing direction',
        alignment:
          'default starts at the inline start with equal gaps; hAlign end ends at the inline end; justify between spans start to end; hAlign center wins over justify end; vAlign center centers on the cross axis; align end sits at the block end; vAlign start wins over align end; wrap breaks into more than one line inside the stack',
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometryStable,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      failures,
      passed: failures.length === 0,
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
        component: 'core/HStack',
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
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
