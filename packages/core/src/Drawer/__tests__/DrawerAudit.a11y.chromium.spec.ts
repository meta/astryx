// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Drawer

/**
 * @file DrawerAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Drawer Storybook fixtures in light/dark, neutral/custom themes, LTR/RTL, wide/narrow, modal/non-modal, purpose, padding, and stacked states
 * @output Bounded screenshots and fail-closed sensor receipts for the Drawer whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Drawer component-audit pull request
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

const OUTPUT = path.resolve('test-results/drawer-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';

type Case = {
  key: string;
  story: string;
  buttons: string[];
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
  expected: {
    count?: number;
    side?: 'start' | 'end';
    modal?: boolean;
    role?: 'dialog' | 'alertdialog';
    narrowCoverage?: 'reveal' | 'full';
    motionDirection?: Direction;
    paddingPx?: number;
  };
};

const cases: Case[] = [];
function addPair(
  key: string,
  story: string,
  buttons: string[],
  expected: Case['expected'],
  options: Partial<Pick<Case, 'direction' | 'theme' | 'viewport'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story,
      buttons,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
      expected,
    });
  }
}

addPair('modal-end', 'showcase', ['Open inspector'], {
  side: 'end',
  modal: true,
  role: 'dialog',
});
addPair(
  'modal-end-custom-theme',
  'showcase',
  ['Open inspector'],
  {side: 'end', modal: true, role: 'dialog'},
  {theme: 'butter'},
);
addPair('nonmodal-end', 'row-inspector', ['Open drawer'], {
  side: 'end',
  modal: false,
  role: 'dialog',
});
addPair('start-ltr', 'sides', ['Open from start'], {
  side: 'start',
  modal: true,
  role: 'dialog',
});
addPair(
  'end-ambient-rtl',
  'sides',
  ['Open from end'],
  {
    side: 'end',
    modal: true,
    role: 'dialog',
    motionDirection: 'rtl',
  },
  {direction: 'rtl'},
);
addPair(
  'start-self-rtl',
  'self-directed-rtl-start',
  ['Open self-directed RTL start drawer'],
  {side: 'start', modal: true, role: 'dialog', motionDirection: 'rtl'},
);
addPair(
  'end-self-rtl',
  'self-directed-rtl-end',
  ['Open self-directed RTL end drawer'],
  {side: 'end', modal: true, role: 'dialog', motionDirection: 'rtl'},
);
addPair(
  'nested-ltr-override',
  'nested-ltr-override',
  ['Open nested LTR drawer'],
  {side: 'end', modal: true, role: 'dialog', motionDirection: 'ltr'},
  {direction: 'rtl'},
);
addPair(
  'mobile-reveal',
  'mobile-width',
  ['56px reveal on mobile'],
  {
    side: 'end',
    modal: true,
    role: 'dialog',
    narrowCoverage: 'reveal',
  },
  {viewport: NARROW},
);
addPair(
  'mobile-full',
  'mobile-width',
  ['Full width on mobile'],
  {side: 'end', modal: true, role: 'dialog', narrowCoverage: 'full'},
  {viewport: NARROW},
);
addPair('purpose-form', 'purpose', ['form'], {
  side: 'end',
  modal: true,
  role: 'dialog',
});
addPair('purpose-required', 'purpose', ['required'], {
  side: 'end',
  modal: true,
  role: 'alertdialog',
});
addPair('themed-padding', 'themed-padding', ['Open themed drawer'], {
  side: 'end',
  modal: true,
  role: 'dialog',
  paddingPx: 24,
});
addPair('stacked', 'stacked-drawers', ['Open order', 'Open line item'], {
  count: 2,
  modal: false,
  role: 'dialog',
});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: Case) {
  return `${server.origin}/iframe.html?id=core-drawer--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

async function readClosedTranslateX(page: Page): Promise<number | null> {
  return page.locator('dialog.astryx-drawer').evaluate(dialog => {
    const element = dialog as HTMLElement;
    const previous = element.style.display;
    element.style.display = 'flex';
    const transform = getComputedStyle(element).transform;
    element.style.display = previous;
    if (transform === 'none') {
      return null;
    }
    return new DOMMatrixReadOnly(transform).m41;
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
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();
    await settle(page);

    const closedTranslateX = item.expected.motionDirection
      ? await readClosedTranslateX(page)
      : null;
    if (item.expected.motionDirection) {
      const ltrSign = item.expected.side === 'start' ? -1 : 1;
      const directionSign = item.expected.motionDirection === 'rtl' ? -1 : 1;
      expect(
        (closedTranslateX ?? 0) * ltrSign * directionSign,
        'closed drawer moves toward its resolved logical edge',
      ).toBeGreaterThan(0);
    }

    for (const label of item.buttons) {
      await page.getByRole('button', {name: label, exact: true}).click();
      await settle(page);
    }

    const drawers = page.locator('dialog.astryx-drawer:visible');
    const expectedCount = item.expected.count ?? 1;
    await expect(drawers).toHaveCount(expectedCount);
    const drawer = drawers.last();
    const box = await drawer.boundingBox();
    if (box == null) {
      throw new Error(`${item.key}: visible drawer has no geometry`);
    }

    const observed = await drawer.evaluate(element => {
      const style = getComputedStyle(element);
      const backdrop = getComputedStyle(element, '::backdrop');
      const content = element.firstElementChild;
      const contentStyle = content ? getComputedStyle(content) : null;
      return {
        role: element.getAttribute('role') ?? 'dialog',
        name: element.getAttribute('aria-label'),
        modal: element.getAttribute('aria-modal') === 'true',
        side: element.getAttribute('data-side'),
        direction: style.direction,
        backgroundColor: style.backgroundColor,
        color: style.color,
        transform: style.transform,
        backdropColor: backdrop.backgroundColor,
        contentPaddingInlineStart: contentStyle?.paddingInlineStart ?? null,
        contentPaddingInlineEnd: contentStyle?.paddingInlineEnd ?? null,
        contentOverflowY: contentStyle?.overflowY ?? null,
      };
    });
    const environment = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
    }));

    expect(pageErrors).toEqual([]);
    expect(environment.theme).toBe(item.theme);
    expect(environment.mode).toBe(item.mode);
    expect(environment.viewport).toEqual(item.viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.horizontalOverflow).toBe(false);
    expect(environment.fonts).toBe('loaded');
    expect(observed.side).toBe(item.expected.side ?? observed.side);
    expect(observed.modal).toBe(item.expected.modal);
    expect(observed.role).toBe(item.expected.role);
    expect(observed.transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
    expect(observed.contentOverflowY).toBe('auto');

    const expectedDirection = item.expected.motionDirection ?? item.direction;
    expect(observed.direction).toBe(expectedDirection);
    if (item.expected.side === 'start' && observed.direction === 'ltr') {
      expect(box.x).toBeLessThanOrEqual(0.5);
    }
    if (item.expected.side === 'start' && observed.direction === 'rtl') {
      expect(box.x + box.width).toBeGreaterThanOrEqual(
        item.viewport.width - 0.5,
      );
    }
    if (item.expected.side === 'end' && observed.direction === 'ltr') {
      expect(box.x + box.width).toBeGreaterThanOrEqual(
        item.viewport.width - 0.5,
      );
    }
    if (item.expected.side === 'end' && observed.direction === 'rtl') {
      expect(box.x).toBeLessThanOrEqual(0.5);
    }
    if (item.expected.narrowCoverage === 'reveal') {
      expect(box.width).toBeCloseTo(item.viewport.width - 56, 0);
    }
    if (item.expected.narrowCoverage === 'full') {
      expect(box.width).toBeCloseTo(item.viewport.width, 0);
    }
    if (item.expected.paddingPx != null) {
      expect(Number.parseFloat(observed.contentPaddingInlineStart ?? '')).toBe(
        item.expected.paddingPx,
      );
      expect(Number.parseFloat(observed.contentPaddingInlineEnd ?? '')).toBe(
        item.expected.paddingPx,
      );
    }

    const png = await page.screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-drawer--${item.story}`,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        ...item.expected,
      },
      observed: {
        build: storybookSha,
        drawerCount: expectedCount,
        closedTranslateX,
        geometry: box,
        ...observed,
        ...environment,
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
    component: 'core/Drawer',
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
