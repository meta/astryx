// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit NavHeadingMenuItem

/**
 * @file NavHeadingMenuItemAudit.a11y.chromium.spec.ts
 * @input Exact-head NavMenu stories and the TopNav heading menu story, across modes, direction, and forced colors
 * @output Screenshots and fail-closed sensor receipts for the NavHeadingMenuItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a NavHeadingMenuItem audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('nav-heading-menu-item-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  forcedColors: boolean;
  viewport: {width: number; height: number};
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};

/** WCAG 2.2 SC 1.4.11 non-text contrast and SC 1.4.3 text contrast. */
const MIN_RING_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

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

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme:
      document
        .querySelector('#storybook-root [data-astryx-theme]')
        ?.getAttribute('data-astryx-theme') ?? null,
    direction: getComputedStyle(
      document.querySelector('#storybook-root [dir]') as Element,
    ).direction,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    violations: results.violations.flatMap(violation =>
      violation.nodes.map(
        node =>
          `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
      ),
    ),
    passes: results.passes.length,
  };
}

/**
 * Every row of the open menu: its name, focus, disabled state, outline, and
 * fill. For the focused row, the outline color against the menu surface and
 * against the row's own fill, with the row's opacity applied, and whether the
 * outline sits inside the row's box.
 */
async function readRows(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const rgba = (value: string) => {
      if (ctx == null) {
        return [0, 0, 0, 0];
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#010203';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: number[], alpha: number, base: number[]) =>
      base.map((c, i) => top[i] * alpha + c * (1 - alpha));
    const backdrop = (start: Element) => {
      const layers: number[][] = [];
      let node: Element | null = start;
      while (node != null) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] > 0) {
          layers.push(color);
          if (color[3] >= 1) {
            break;
          }
        }
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      for (const layer of layers.reverse()) {
        base = over(layer, layer[3], base);
      }
      return base;
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const menu = document.querySelector<HTMLElement>(
      '.astryx-nav-heading-menu',
    );
    const rows = menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];
    const surface = menu ? backdrop(menu) : [255, 255, 255];
    return rows.map(row => {
      const style = getComputedStyle(row);
      const focused = row === document.activeElement;
      const outlined =
        style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const opacity = parseFloat(style.opacity);
      const fill = backdrop(row);
      const ringColor = rgba(style.outlineColor);
      const ring = over(ringColor, ringColor[3] * opacity, surface);
      const label = row.querySelector('.astryx-text');
      const labelColor = label ? rgba(getComputedStyle(label).color) : null;
      return {
        name: row.textContent?.trim() ?? '',
        focused,
        focusVisible: row.matches(':focus-visible'),
        disabled: row.getAttribute('aria-disabled') === 'true',
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        outlined,
        outlineInside:
          parseFloat(style.outlineOffset) <= -parseFloat(style.outlineWidth),
        opacity,
        fillVsSurface: ratio(fill, surface),
        ringVsSurface: outlined ? ratio(ring, surface) : null,
        ringVsFill: outlined
          ? ratio(over(ringColor, ringColor[3] * opacity, fill), fill)
          : null,
        labelContrast:
          labelColor && !row.matches('[aria-disabled="true"]')
            ? ratio(over(labelColor, labelColor[3], fill), fill)
            : null,
      };
    });
  });
}
type Row = Awaited<ReturnType<typeof readRows>>[number];

/** Exactly one row is focused and only that row draws a ring that meets 3:1. */
function checkKeyboardRing(check: Check, rows: Row[], expected: string) {
  const focused = rows.filter(row => row.focused);
  check(
    focused.length === 1 && focused[0].name === expected,
    `focused ${focused.map(row => row.name).join(', ') || 'none'}, expected ${expected}`,
  );
  const row = focused[0];
  if (row == null) {
    return;
  }
  check(
    row.outlined,
    `${row.name}: keyboard focus draws no outline (${row.outline})`,
  );
  check(row.outlineInside, `${row.name}: outline is not inside the row`);
  if (!row.disabled) {
    check(
      (row.ringVsSurface ?? 0) >= MIN_RING_CONTRAST &&
        (row.ringVsFill ?? 0) >= MIN_RING_CONTRAST,
      `${row.name}: ring ${row.ringVsSurface}:1 against the menu, ${row.ringVsFill}:1 against the row fill`,
    );
    if (row.labelContrast != null) {
      check(
        row.labelContrast >= MIN_TEXT_CONTRAST,
        `${row.name}: label ${row.labelContrast}:1 on the focused fill`,
      );
    }
  }
  for (const other of rows.filter(r => !r.focused)) {
    check(!other.outlined, `${other.name}: unfocused row draws an outline`);
  }
}

function focusedName(rows: Row[]) {
  return rows.find(row => row.focused)?.name ?? null;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `keyboard-${mode}-${direction}`,
      group: 'standalone',
      story: 'core-navmenu--with-icons',
      ready: '#storybook-root [role="menuitem"]',
      mode,
      direction,
      forcedColors: false,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const items = page.getByRole('menuitem');
        await items.first().focus();
        await page.keyboard.press('ArrowDown');
        await settle(page);
        const down = await readRows(page);
        checkKeyboardRing(check, down, 'Documents');
        await frame('keyboard-focus', {rows: down});
        await page.keyboard.press('End');
        await settle(page);
        const end = await readRows(page);
        checkKeyboardRing(check, end, 'Settings');
        const result = await axe(page);
        check(
          result.violations.length === 0,
          `axe: ${result.violations.join(' | ')}`,
        );
        await frame('keyboard-end', {rows: end, axe: result});
      },
    });
  }

  cases.push({
    key: `pointer-${mode}-ltr`,
    group: 'standalone',
    story: 'core-navmenu--small-size',
    ready: '#storybook-root [role="menuitem"]',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const items = page.getByRole('menuitem');
      await items.nth(2).click();
      await page.mouse.move(0, 0);
      await settle(page);
      const pressed = await readRows(page);
      const target = pressed.find(row => row.name === 'Delete');
      check(
        target?.focused === true,
        `pointer press focused ${focusedName(pressed)}`,
      );
      check(
        pressed.every(row => !row.outlined),
        `pointer press draws an outline: ${pressed
          .filter(r => r.outlined)
          .map(r => r.name)
          .join(', ')}`,
      );
      await frame('pointer-press', {rows: pressed});
      await page.keyboard.press('ArrowUp');
      await settle(page);
      const after = await readRows(page);
      checkKeyboardRing(check, after, 'Duplicate');
      await frame('keyboard-after-pointer', {rows: after});
    },
  });

  cases.push({
    key: `disabled-${mode}-ltr`,
    group: 'standalone',
    story: 'core-navmenu--disabled-items',
    ready: '#storybook-root [role="menuitem"]',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const items = page.getByRole('menuitem');
      await items.first().focus();
      await page.keyboard.press('ArrowDown');
      await settle(page);
      const rows = await readRows(page);
      // A disabled row is an inactive component, which SC 1.4.11 exempts.
      // The receipt records its dimmed ring and checks only that it shows.
      checkKeyboardRing(check, rows, 'Analytics');
      await frame('keyboard-focus-disabled', {rows});
    },
  });

  cases.push({
    key: `heading-${mode}-ltr`,
    group: 'heading',
    story: 'core-topnav--with-heading-menu',
    ready: '#storybook-root nav',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const trigger = page.getByRole('button', {name: /Acme Suite/});
      check((await trigger.count()) === 1, 'no Acme Suite heading button');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.locator('.astryx-nav-heading-menu').waitFor();
      await page.keyboard.press('ArrowDown');
      await settle(page);
      const rows = await readRows(page);
      const name = focusedName(rows);
      check(name != null, 'no row focused after Enter and ArrowDown');
      if (name != null) {
        checkKeyboardRing(check, rows, name);
      }
      await frame('open-keyboard-focus', {rows});
    },
  });
}

cases.push({
  key: 'forced-colors-light-ltr',
  group: 'standalone',
  story: 'core-navmenu--with-icons',
  ready: '#storybook-root [role="menuitem"]',
  mode: 'light',
  direction: 'ltr',
  forcedColors: true,
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const items = page.getByRole('menuitem');
    await items.first().focus();
    await page.keyboard.press('ArrowDown');
    await settle(page);
    const rows = await readRows(page);
    const row = rows.find(r => r.focused);
    check(row?.name === 'Documents', `focused ${row?.name}`);
    check(
      row?.outlined === true,
      `forced colors: focused row draws no outline (${row?.outline})`,
    );
    check(
      row?.outlineInside === true,
      'forced colors: outline is not inside the row',
    );
    for (const other of rows.filter(r => !r.focused)) {
      check(!other.outlined, `${other.name}: unfocused row draws an outline`);
    }
    await frame('keyboard-focus', {rows});
  },
});

test.beforeAll(async () => {
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page.screenshot({animations: 'disabled'});
    const file = `${item.key}__${state}.png`;
    fs.writeFileSync(path.join(OUTPUT, file), screenshot);
    frames.push({
      state,
      observed,
      file,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
    });
  };
  try {
    await page.goto(url, {waitUntil: 'load'});
    await page.locator(item.ready).first().waitFor();
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(sensors.theme === 'neutral', `theme ${sensors.theme}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(
      sensors.forcedColors === item.forcedColors,
      `forced colors ${sensors.forcedColors}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'NavHeadingMenuItem',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    direction: item.direction,
    forcedColors: item.forcedColors,
    viewport: item.viewport,
    sensors,
    pageErrors,
    frames,
    passed: failures.length === 0,
    failures,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${item.key}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return failures.map(failure => `${item.key}: ${failure}`);
}

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({deviceScaleFactor: 2});
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => c.group === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
