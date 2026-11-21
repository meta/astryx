// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ProgressBar

/**
 * @file ProgressBarAudit.a11y.chromium.spec.ts
 * @input Exact-head ProgressBar stories, across modes, themes, direction, pointer and motion settings
 * @output Screenshots and fail-closed sensor receipts for the ProgressBar whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a ProgressBar audit pull request
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

const OUTPUT = path.resolve('progress-bar-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;
type Pointer = 'fine' | 'coarse';

type AuditCase = {
  key: string;
  group: string;
  story: string;
  ready: string;
  mode: Mode;
  theme: string;
  direction: Direction;
  viewport: Viewport;
  pointer: Pointer;
  reducedMotion: 'reduce' | 'no-preference';
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 640};
const NARROW = {width: 320, height: 640};

test.describe.configure({retries: 0, timeout: 600_000});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

/**
 * Waits for fonts, images and two frames. `holdMotionStill` pins every
 * transition to 0s and re-emulates media, so motion and touch cases skip it.
 */
async function settle(page: Page, still = true) {
  if (still) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) {
      if (!image.complete) {
        await image.decode().catch(() => null);
      }
    }
  });
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
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    coarse: matchMedia('(pointer: coarse)').matches,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/** Axe on the story root, WCAG 2.2 A and AA rules. */
async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(
      node => `${violation.id}: ${node.target.join(' ')} ${node.html}`,
    ),
  );
}

async function noSidewaysScroll(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** The first bar on the story: its name, value state, geometry and paint. */
async function bar(page: Page, index = 0) {
  return page.evaluate(i => {
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-progress-bar',
      ),
    );
    const root = roots[i];
    if (root == null) {
      return null;
    }
    const track = root.querySelector<HTMLElement>('[role="progressbar"]');
    const fill = track?.firstElementChild as HTMLElement | null;
    const labelId = track?.getAttribute('aria-labelledby');
    const label = labelId ? document.getElementById(labelId) : null;
    const t = track?.getBoundingClientRect();
    const f = fill?.getBoundingClientRect();
    const marks = Array.from(
      root.querySelectorAll<HTMLElement>('.astryx-progress-bar-mark'),
    );
    const fs = fill ? getComputedStyle(fill) : null;
    return {
      variant: root.getAttribute('data-variant'),
      name: label?.textContent ?? null,
      valuenow: track?.getAttribute('aria-valuenow') ?? null,
      valuemax: track?.getAttribute('aria-valuemax') ?? null,
      valuetext: track?.getAttribute('aria-valuetext') ?? null,
      track: t
        ? {left: t.left, right: t.right, width: t.width, height: t.height}
        : null,
      trackOpacity: track ? getComputedStyle(track).opacity : null,
      fill: f ? {left: f.left, right: f.right, width: f.width} : null,
      fillColor: fs?.backgroundColor ?? null,
      fillVariant: fill?.getAttribute('data-variant') ?? null,
      animationName: fs?.animationName ?? null,
      transition: fs
        ? `${fs.transitionDuration} ${fs.transitionTimingFunction}`
        : null,
      marks: marks.map(mark => ({
        name: mark.getAttribute('aria-label'),
        role: mark.getAttribute('role'),
        insideProgressbar: track?.contains(mark) ?? false,
        placement: mark.getAttribute('data-placement'),
        transform: getComputedStyle(mark).transform,
        color: getComputedStyle(mark).backgroundColor,
      })),
    };
  }, index);
}

/** Re-renders a story with new args and resolves once it rendered. */
async function setArgs(page: Page, storyId: string, updatedArgs: object) {
  await page.evaluate(
    async ({storyId, updatedArgs}) =>
      new Promise<void>(resolve => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, handler: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        channel.once('storyRendered', () => resolve());
        channel.emit('updateStoryArgs', {storyId, updatedArgs});
        setTimeout(resolve, 1500);
      }),
    {storyId, updatedArgs},
  );
  await settle(page);
}

/** Expected leading edge: the clamped share of the track, in reading order. */
function edgeError(
  b: NonNullable<Awaited<ReturnType<typeof bar>>>,
  direction: Direction,
) {
  if (b.track == null || b.fill == null || b.valuenow == null) {
    return Infinity;
  }
  const share = Number(b.valuenow) / Number(b.valuemax);
  const expected =
    direction === 'ltr'
      ? b.track.left + b.track.width * share
      : b.track.right - b.track.width * share;
  const edge = direction === 'ltr' ? b.fill.right : b.fill.left;
  return Math.abs(edge - expected);
}

const cases: AuditCase[] = [];

function addCase(item: Omit<AuditCase, 'theme'> & {theme?: string}) {
  cases.push({theme: 'neutral', ...item});
}

const READY = '#storybook-root [role="progressbar"]';

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    addCase({
      key: `default-${mode}-${direction}`,
      group: 'determinate',
      story: 'core-progressbar--with-value-label',
      ready: READY,
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const b = await bar(page);
        check(b != null, 'no bar');
        if (b == null) {
          return;
        }
        check(b.name === 'Storage used', `name ${b.name}`);
        check(
          b.valuenow === '75' && b.valuemax === '100',
          `value ${b.valuenow}/${b.valuemax}`,
        );
        check(b.valuetext === '75%', `valuetext ${b.valuetext}`);
        check(b.track?.height === 8, `track height ${b.track?.height}`);
        check(
          edgeError(b, direction) <= 1,
          `leading edge off by ${edgeError(b, direction)}px`,
        );
        const violations = await axe(page);
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {bar: b});
      },
    });
  }
  addCase({
    key: `variants-${mode}`,
    group: 'determinate',
    story: 'core-progressbar--variants',
    ready: READY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const bars = [];
      for (let i = 0; i < 5; i++) {
        bars.push(await bar(page, i));
      }
      const colors = new Set(bars.map(b => b?.fillColor));
      check(
        colors.size === 5,
        `five distinct fills, got ${[...colors].join(', ')}`,
      );
      check(!colors.has('rgba(0, 0, 0, 0)'), 'a variant paints no fill');
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {bars});
    },
  });
  addCase({
    key: `disabled-${mode}`,
    group: 'determinate',
    story: 'core-progressbar--disabled',
    ready: READY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const b = await bar(page);
      check(
        b?.trackOpacity === '0.5',
        `disabled track opacity ${b?.trackOpacity}`,
      );
      check(b?.fillVariant === 'disabled', `fill variant ${b?.fillVariant}`);
      // WCAG 1.4.3 exempts the text of an inactive component, and FR5 mutes
      // a disabled bar's label and value text. Any other axe result fails.
      const all = await axe(page);
      const inactiveText = all.filter(v => v.startsWith('color-contrast:'));
      const violations = all.filter(v => !v.startsWith('color-contrast:'));
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {bar: b, inactiveText});
    },
  });
  addCase({
    key: `marks-${mode}`,
    group: 'marks',
    story: 'core-progressbar--with-multiple-marks',
    ready: '#storybook-root .astryx-progress-bar-mark',
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const b = await bar(page);
      check(b?.marks.length === 3, `marks ${b?.marks.length}`);
      for (const mark of b?.marks ?? []) {
        check(mark.role === 'img' && !!mark.name, `mark name ${mark.name}`);
        check(!mark.insideProgressbar, `mark ${mark.name} inside progressbar`);
      }
      check(
        JSON.stringify(b?.marks.map(m => m.placement)) ===
          '["fill","fill","track"]',
        `placements ${b?.marks.map(m => m.placement).join(',')}`,
      );
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {bar: b});
      await page.keyboard.press('Tab');
      const tooltip = page.getByRole('tooltip');
      await tooltip.waitFor({timeout: 3000}).catch(() => null);
      const shown =
        (await tooltip.count()) > 0
          ? await tooltip.first().textContent()
          : null;
      check(shown === 'Q1 target', `focused mark tooltip ${shown}`);
      await frame('mark-focus', {tooltip: shown});
    },
  });
}

addCase({
  key: 'marks-matcha-light',
  group: 'marks',
  story: 'core-progressbar--marks-across-variants',
  ready: '#storybook-root .astryx-progress-bar-mark',
  mode: 'light',
  theme: 'matcha',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const b = await bar(page);
    check((b?.marks.length ?? 0) > 0, 'themed marks render');
    await frame('rest', {bar: b});
  },
});

// FR8: the root keeps its reflected variant when a caller passes data-variant.
addCase({
  key: 'caller-data-variant',
  group: 'api',
  story: 'core-progressbar--default',
  ready: READY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    await setArgs(page, 'core-progressbar--default', {
      variant: 'success',
      'data-variant': 'error',
      'data-section': 'uploads',
    });
    const b = await bar(page);
    const section = await page
      .locator('#storybook-root .astryx-progress-bar')
      .first()
      .getAttribute('data-section');
    check(b?.variant === 'success', `root data-variant ${b?.variant}`);
    check(section === 'uploads', `caller data attribute ${section}`);
    await frame('rest', {bar: b, section});
  },
});

// FR4 and INV14: a variant a theme adds paints the default accent fill.
addCase({
  key: 'theme-added-variant',
  group: 'api',
  story: 'core-progressbar--with-target-mark',
  ready: READY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const accent = await bar(page);
    await setArgs(page, 'core-progressbar--with-target-mark', {
      variant: 'brand',
      marks: [{value: 20, label: 'Start'}],
    });
    const added = await bar(page);
    check(added?.fillVariant === 'brand', `fill variant ${added?.fillVariant}`);
    check(
      added?.fillColor === accent?.fillColor,
      `added variant fill ${added?.fillColor}, accent ${accent?.fillColor}`,
    );
    const onFill = added?.marks.find(m => m.placement === 'fill');
    check(
      onFill != null && onFill.color !== 'rgba(0, 0, 0, 0)',
      `on-fill mark color ${onFill?.color}`,
    );
    await frame('rest', {accent, added});
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  addCase({
    key: `indeterminate-${direction}`,
    group: 'indeterminate',
    story: 'core-progressbar--indeterminate-variants',
    ready: READY,
    mode: 'light',
    direction,
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'no-preference',
    run: async (page, check, frame) => {
      const b = await bar(page);
      check(
        b?.valuenow == null && b?.valuetext == null,
        'value attributes while indeterminate',
      );
      const violations = await axe(page);
      check(violations.length === 0, `axe: ${violations.join(' | ')}`);
      await frame('rest', {bar: b});
    },
  });
}

// FR6 and INV11: in a left-to-right region of a right-to-left page the slide
// and the mark centering follow the bar's own direction.
addCase({
  key: 'ltr-region-in-rtl-page',
  group: 'indeterminate',
  story: 'core-progressbar--indeterminate',
  ready: READY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'no-preference',
  run: async (page, check, frame) => {
    const ltrName = (await bar(page))?.animationName;
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-progress-bar',
      ) as HTMLElement;
      const page = document.createElement('div');
      page.setAttribute('dir', 'rtl');
      (root.parentElement as HTMLElement).insertBefore(page, root);
      page.appendChild(root);
      root.setAttribute('dir', 'ltr');
    });
    await settle(page, false);
    const inRegion = await bar(page);
    check(
      inRegion?.animationName === ltrName,
      `slide in LTR region ${inRegion?.animationName}, LTR page ${ltrName}`,
    );
    await frame('rest', {ltrName, inRegion});
    await setArgs(page, 'core-progressbar--indeterminate', {
      isIndeterminate: false,
      value: 45,
      marks: [{value: 80, label: 'Goal'}],
    });
    const mark = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(
        '#storybook-root .astryx-progress-bar',
      ) as HTMLElement;
      const holder = document.createElement('div');
      holder.setAttribute('dir', 'rtl');
      (root.parentElement as HTMLElement).insertBefore(holder, root);
      holder.appendChild(root);
      root.setAttribute('dir', 'ltr');
      const m = root.querySelector<HTMLElement>(
        '.astryx-progress-bar-mark',
      ) as HTMLElement;
      return new DOMMatrixReadOnly(getComputedStyle(m).transform).m41;
    });
    check(mark < 0, `mark centering in LTR region shifts ${mark}px`);
  },
});

for (const pointer of ['fine', 'coarse'] as const) {
  addCase({
    key: `reduced-motion-pulse-${pointer}`,
    group: `pulse-${pointer}`,
    story: 'core-progressbar--indeterminate',
    ready: READY,
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    pointer,
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const b = await bar(page);
      check(
        b?.fill != null &&
          b.track != null &&
          Math.abs(b.fill.width - b.track.width) <= 1,
        `pulse fill width ${b?.fill?.width} of ${b?.track?.width}`,
      );
      check(b?.animationName !== 'none', `pulse animation ${b?.animationName}`);
      await frame('rest', {bar: b});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  addCase({
    key: `narrow-${direction}`,
    group: 'narrow',
    story: 'core-progressbar--with-multiple-marks',
    ready: READY,
    mode: 'light',
    direction,
    viewport: NARROW,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const scroll = await noSidewaysScroll(page);
      check(
        scroll.scrollWidth <= scroll.clientWidth,
        `page scrolls sideways: ${scroll.scrollWidth} > ${scroll.clientWidth}`,
      );
      const b = await bar(page);
      const narrowEdge = b == null ? Infinity : edgeError(b, direction);
      check(narrowEdge <= 1, `narrow leading edge off by ${narrowEdge}px`);
      await frame('rest', {scroll, bar: b});
    },
  });
}

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

function isStill(item: AuditCase) {
  return item.reducedMotion === 'reduce' && !item.group.startsWith('pulse-');
}

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.reducedMotion,
  });
  if (item.pointer === 'coarse') {
    // Playwright has no hover or pointer media option; Chromium takes them over CDP.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [
        {name: 'hover', value: 'none'},
        {name: 'any-hover', value: 'none'},
        {name: 'pointer', value: 'coarse'},
        {name: 'any-pointer', value: 'coarse'},
        {
          name: 'prefers-reduced-motion',
          value: item.reducedMotion === 'reduce' ? 'reduce' : '',
        },
        {name: 'prefers-color-scheme', value: item.mode},
      ],
    });
  }
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});

  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
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

  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  try {
    await page.locator(item.ready).first().waitFor({timeout: 10_000});
    // A pointer left over the last case's story would hover this one.
    await page.mouse.move(0, 0);
    await settle(page, isStill(item));
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(sensors.theme === item.theme, `theme ${sensors.theme}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === (item.reducedMotion === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    check(
      sensors.coarse === (item.pointer === 'coarse') &&
        sensors.hoverNone === (item.pointer === 'coarse'),
      `pointer coarse=${sensors.coarse} hover-none=${sensors.hoverNone}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `case did not run: ${String(error).split('\n')[0]}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

  const receipt = {
    component: 'ProgressBar',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: item.theme,
    direction: item.direction,
    viewport: item.viewport,
    pointer: item.pointer,
    reducedMotion: item.reducedMotion,
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
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      hasTouch: group.endsWith('-coarse'),
    });
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
