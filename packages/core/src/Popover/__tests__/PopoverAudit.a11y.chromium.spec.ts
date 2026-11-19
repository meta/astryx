// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Popover

/**
 * @file PopoverAudit.a11y.chromium.spec.ts
 * @input Exact-head Popover stories across modes, direction, forced colors, and a narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the Popover whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Popover audit pull request
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

const OUTPUT = path.resolve('popover-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type Frame = {state: string; observed: unknown};
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  forcedColors: boolean;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 568};

/** WCAG 2.2 SC 1.4.3 text contrast. */
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
  await page.waitForTimeout(60);
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

function checkAxe(check: Check, result: Awaited<ReturnType<typeof axe>>) {
  check(
    result.violations.length === 0,
    `axe: ${result.violations.join(' | ')}`,
  );
  check(result.passes > 0, 'axe checked nothing');
}

/**
 * The open surface, its trigger, and the focused element: semantics, boxes,
 * scroll state, the forced-colors edge, and the contrast of the surface text.
 */
async function readPopover(page: Page, triggerName: string) {
  return page.evaluate(name => {
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
        base = base.map((c, i) => layer[i] * layer[3] + c * (1 - layer[3]));
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
    const box = (el: Element | null) => {
      if (el == null) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const surface =
      Array.from(
        document.querySelectorAll<HTMLElement>('.astryx-popover'),
      ).find(visible) ?? null;
    const trigger =
      Array.from(document.querySelectorAll<HTMLElement>('button')).find(
        b => b.textContent?.trim() === name,
      ) ?? null;
    const active = document.activeElement as HTMLElement | null;
    const activeStyle = active ? getComputedStyle(active) : null;
    const texts = surface
      ? Array.from(surface.querySelectorAll('.astryx-text')).filter(visible)
      : [];
    const textContrast = texts.map(t => {
      const fg = rgba(getComputedStyle(t).color);
      const bg = backdrop(t);
      return ratio(
        bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3])),
        bg,
      );
    });
    const style = surface ? getComputedStyle(surface) : null;
    const fallback = surface?.querySelector<HTMLElement>(
      '[data-astryx-popover-fallback-close]',
    );
    return {
      open: surface != null,
      surface: surface
        ? {
            id: surface.id || null,
            role: surface.getAttribute('role'),
            modal: surface.getAttribute('aria-modal'),
            label: surface.getAttribute('aria-label'),
            box: box(surface),
            overflowY: style?.overflowY,
            scrollable: surface.scrollHeight > surface.clientHeight + 1,
            border: `${style?.borderTopStyle} ${style?.borderTopWidth} ${style?.borderTopColor}`,
            color: style?.color ?? null,
            themeTextColor: (() => {
              const root = document.querySelector('[data-astryx-theme]');
              return root ? getComputedStyle(root).color : null;
            })(),
            minTextContrast: textContrast.length
              ? Math.min(...textContrast)
              : null,
            fallbackVisible: fallback
              ? getComputedStyle(fallback).clipPath === 'none' &&
                fallback.getBoundingClientRect().width > 1
              : null,
            controlledBy:
              trigger?.getAttribute('aria-controls') != null &&
              document
                .getElementById(trigger.getAttribute('aria-controls') ?? '')
                ?.contains(surface) === true,
          }
        : null,
      trigger: trigger
        ? {
            box: box(trigger),
            expanded: trigger.getAttribute('aria-expanded'),
            haspopup: trigger.getAttribute('aria-haspopup'),
            controls: trigger.getAttribute('aria-controls'),
          }
        : null,
      active:
        active && active !== document.body
          ? {
              tag: active.tagName.toLowerCase(),
              role: active.getAttribute('role'),
              name:
                active.getAttribute('aria-label') ??
                (active.id
                  ? document.querySelector(`label[for="${active.id}"]`)
                      ?.textContent
                  : null) ??
                active.textContent?.trim().slice(0, 40) ??
                null,
              inSurface: surface != null && surface.contains(active),
              isSurface: active === surface,
              isTrigger: active === trigger,
              focusVisible: active.matches(':focus-visible'),
              outline: activeStyle
                ? `${activeStyle.outlineStyle} ${activeStyle.outlineWidth}`
                : null,
            }
          : null,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth,
        innerHeight,
      },
    };
  }, triggerName);
}
type Read = Awaited<ReturnType<typeof readPopover>>;

/** Dialog semantics on the surface and the trigger relationship (AR1, AR2). */
function checkOpenSemantics(check: Check, read: Read, label: string) {
  check(read.open, 'no visible popover surface');
  const s = read.surface;
  const t = read.trigger;
  check(s?.role === 'dialog', `surface role ${s?.role}`);
  check(s?.modal === 'true', `surface aria-modal ${s?.modal}`);
  check(s?.label === label, `surface label ${s?.label}`);
  check(t?.expanded === 'true', `trigger aria-expanded ${t?.expanded}`);
  check(t?.haspopup === 'dialog', `trigger aria-haspopup ${t?.haspopup}`);
  check(
    s?.controlledBy === true,
    `trigger aria-controls ${t?.controls} does not name the popup`,
  );
  check(
    (s?.minTextContrast ?? MIN_TEXT_CONTRAST) >= MIN_TEXT_CONTRAST,
    `surface text contrast ${s?.minTextContrast}`,
  );
}

/** The surface stays inside the viewport. */
function checkInViewport(check: Check, read: Read) {
  const b = read.surface?.box;
  check(
    b != null &&
      b.left >= 0 &&
      b.top >= 0 &&
      b.right <= read.page.innerWidth &&
      b.bottom <= read.page.innerHeight,
    `surface ${JSON.stringify(b)} leaves the ${read.page.innerWidth}x${read.page.innerHeight} viewport`,
  );
}

async function waitOpen(page: Page) {
  await page
    .locator('.astryx-popover')
    .filter({visible: true})
    .first()
    .waitFor();
  await settle(page);
}

async function waitClosed(page: Page) {
  await expect
    .poll(async () => (await readPopover(page, '')).open, {timeout: 3000})
    .toBe(false);
  await settle(page);
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `keyboard-${mode}-${direction}`,
      group: 'default',
      story: 'core-popover--default',
      ready: '#storybook-root button',
      mode,
      direction,
      forcedColors: false,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const trigger = page.getByRole('button', {name: 'Settings'});
        const closed = await readPopover(page, 'Settings');
        check(!closed.open, 'surface visible before opening');
        check(
          closed.trigger?.expanded === 'false',
          `closed trigger aria-expanded ${closed.trigger?.expanded}`,
        );
        await trigger.focus();
        await page.keyboard.press('Enter');
        await waitOpen(page);
        const open = await readPopover(page, 'Settings');
        checkOpenSemantics(check, open, 'Settings');
        checkInViewport(check, open);
        const s = open.surface?.box;
        const t = open.trigger?.box;
        check(
          s != null && t != null && s.top >= t.bottom - 1,
          `below: surface top ${s?.top}, trigger bottom ${t?.bottom}`,
        );
        check(
          s != null &&
            t != null &&
            (direction === 'ltr'
              ? Math.abs(s.left - t.left) <= 1
              : Math.abs(s.right - t.right) <= 1),
          `start alignment in ${direction}: surface ${JSON.stringify(s)}, trigger ${JSON.stringify(t)}`,
        );
        check(s?.width === 280, `surface width ${s?.width}`);
        check(
          open.active?.inSurface === true && open.active.role === 'switch',
          `focus entry ${JSON.stringify(open.active)}`,
        );
        check(
          open.active?.focusVisible === true &&
            !open.active.outline?.startsWith('none'),
          `keyboard entry shows no focus ring ${JSON.stringify(open.active)}`,
        );
        const openAxe = await axe(page);
        checkAxe(check, openAxe);
        await frame('open-keyboard', {open, axe: openAxe});

        const order: (string | null | undefined)[] = [];
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Tab');
          const read = await readPopover(page, 'Settings');
          check(
            read.active?.inSurface === true,
            `Tab ${i + 1} left the popover`,
          );
          order.push(read.active?.name?.trim());
        }
        await settle(page);
        await frame('tab-cycle', {order});

        await page.keyboard.press('Escape');
        await waitClosed(page);
        const after = await readPopover(page, 'Settings');
        check(
          after.active?.isTrigger === true,
          `Escape focus ${JSON.stringify(after.active)}`,
        );
        check(
          after.trigger?.expanded === 'false',
          `after Escape aria-expanded ${after.trigger?.expanded}`,
        );
        await frame('escaped', {after});
      },
    });
  }

  cases.push({
    key: `pointer-${mode}-ltr`,
    group: 'default',
    story: 'core-popover--default',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await page.getByRole('button', {name: 'Settings'}).click();
      await waitOpen(page);
      const open = await readPopover(page, 'Settings');
      checkOpenSemantics(check, open, 'Settings');
      check(
        open.active?.inSurface === true && open.active.role === 'switch',
        `pointer focus entry ${JSON.stringify(open.active)}`,
      );
      check(
        open.active?.focusVisible === false,
        `pointer entry shows a keyboard focus ring ${JSON.stringify(open.active)}`,
      );
      await frame('open-pointer', {open});
      await page.mouse.click(860, 660);
      await waitClosed(page);
      const after = await readPopover(page, 'Settings');
      check(
        after.trigger?.expanded === 'false',
        `after outside press aria-expanded ${after.trigger?.expanded}`,
      );
      await frame('outside-press', {after});
    },
  });

  cases.push({
    key: `above-${mode}-ltr`,
    group: 'placement',
    story: 'core-popover--above',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await page.getByRole('button', {name: 'Shortcuts'}).click();
      await waitOpen(page);
      const open = await readPopover(page, 'Shortcuts');
      checkOpenSemantics(check, open, 'Info');
      checkInViewport(check, open);
      const s = open.surface?.box;
      const t = open.trigger?.box;
      check(
        s != null && t != null && s.bottom <= t.top + 1,
        `above: surface bottom ${s?.bottom}, trigger top ${t?.top}`,
      );
      check(
        open.active?.inSurface === true,
        `focus entry ${JSON.stringify(open.active)}`,
      );
      const openAxe = await axe(page);
      checkAxe(check, openAxe);
      await frame('open', {open, axe: openAxe});
    },
  });

  cases.push({
    key: `readonly-${mode}-ltr`,
    group: 'readonly',
    story: 'core-popover--read-only-dialog-focus',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    forcedColors: false,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const name = 'View deployment status';
      await waitOpen(page);
      const open = await readPopover(page, name);
      checkOpenSemantics(check, open, 'Deployment status');
      check(
        open.active?.isSurface === true,
        `read-only entry ${JSON.stringify(open.active)}`,
      );
      check(
        open.surface?.fallbackVisible === false,
        'fallback close shows before Tab reaches it',
      );
      await frame('open', {open});
      await page.keyboard.press('Tab');
      await settle(page);
      const tabbed = await readPopover(page, name);
      check(
        tabbed.active?.inSurface === true &&
          tabbed.active.name === 'Close popover' &&
          tabbed.surface?.fallbackVisible === true,
        `Tab reached ${JSON.stringify(tabbed.active)}`,
      );
      await frame('fallback-close', {tabbed});
      await page.keyboard.press('Shift+Tab');
      await settle(page);
      const back = await readPopover(page, name);
      check(back.active?.inSurface === true, 'Shift+Tab left the popover');
      await page.keyboard.press('Escape');
      await waitClosed(page);
      const after = await readPopover(page, name);
      // The story opens the popover from code while focus is on the page.
      // The receipt records where focus lands after Escape, and the finding
      // it shows, and does not fail on it.
      await frame('escaped', {
        after,
        finding:
          after.active == null
            ? 'Escape returned focus to the body; the trigger is still mounted'
            : null,
      });
    },
  });
}

cases.push({
  key: 'narrow-light-ltr',
  group: 'narrow',
  story: 'core-popover--default',
  ready: '#storybook-root button',
  mode: 'light',
  direction: 'ltr',
  forcedColors: false,
  viewport: NARROW,
  run: async (page, check, frame) => {
    await page.getByRole('button', {name: 'Settings'}).click();
    await waitOpen(page);
    const open = await readPopover(page, 'Settings');
    checkOpenSemantics(check, open, 'Settings');
    checkInViewport(check, open);
    check(
      open.page.scrollWidth <= open.page.clientWidth,
      `horizontal scroll at 320px: ${JSON.stringify(open.page)}`,
    );
    await frame('open', {open});
  },
});

cases.push({
  key: 'tall-light-ltr',
  group: 'narrow',
  story: 'core-popover--tall-content-overflow',
  ready: '#storybook-root button',
  mode: 'light',
  direction: 'ltr',
  forcedColors: false,
  viewport: NARROW,
  run: async (page, check, frame) => {
    await waitOpen(page);
    const open = await readPopover(page, '');
    check(
      open.surface?.role === 'dialog',
      `surface role ${open.surface?.role}`,
    );
    checkInViewport(check, open);
    check(
      open.surface?.scrollable === true &&
        ['auto', 'scroll'].includes(open.surface.overflowY ?? ''),
      `tall content does not scroll inside the surface ${JSON.stringify(open.surface)}`,
    );
    await frame('open', {open});
  },
});

cases.push({
  key: 'forced-colors-light-ltr',
  group: 'forced-colors',
  story: 'core-popover--default',
  ready: '#storybook-root button',
  mode: 'light',
  direction: 'ltr',
  forcedColors: true,
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const trigger = page.getByRole('button', {name: 'Settings'});
    await trigger.focus();
    await page.keyboard.press('Enter');
    await waitOpen(page);
    const open = await readPopover(page, 'Settings');
    check(
      open.surface != null && /^solid [1-9]/.test(open.surface.border),
      `forced colors: surface edge ${open.surface?.border}`,
    );
    check(
      open.active?.focusVisible === true &&
        !open.active.outline?.startsWith('none'),
      `forced colors: focused control ${JSON.stringify(open.active)}`,
    );
    await frame('open', {open});
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
  const frames: (Frame & {file: string; sha256: string})[] = [];
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
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.forcedColors === item.forcedColors,
      `forced colors ${sensors.forcedColors}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'Popover',
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
