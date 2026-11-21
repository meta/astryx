// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RadioIndicator

/**
 * @file RadioIndicatorAudit.a11y.chromium.spec.ts
 * @input Exact-head Indicator and RadioList stories, across modes, themes, direction, pointer and motion settings
 * @output Screenshots and fail-closed sensor receipts for the RadioIndicator whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a RadioIndicator audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {resetAuditEvidence} from '@astryxdesign/a11y-spec/evidence';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const EVIDENCE = path.resolve('radio-indicator-audit-evidence');
let OUTPUT = EVIDENCE;

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;
type Pointer = 'fine';

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

test.describe.configure({mode: 'serial', retries: 0, timeout: 600_000});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

/**
 * Waits for fonts, images and two frames. `holdMotionStill` pins every
 * transition to 0s and re-emulates media, so motion cases skip it.
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

/** Every radio circle on the story, measured with its dot. */
async function radios(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-radio-indicator',
      ),
    ).map(circle => {
      const c = circle.getBoundingClientRect();
      const cs = getComputedStyle(circle);
      const dot = circle.querySelector<HTMLElement>(
        '.astryx-radio-indicator-dot',
      );
      const d = dot?.getBoundingClientRect();
      return {
        checked: circle.getAttribute('data-checked'),
        disabled: circle.getAttribute('data-disabled'),
        size: circle.getAttribute('data-size'),
        hidden: circle.getAttribute('aria-hidden'),
        width: c.width,
        height: c.height,
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopColor,
        fill: cs.backgroundColor,
        opacity: cs.opacity,
        transition: cs.transitionDuration,
        dot: d
          ? {
              width: d.width,
              height: d.height,
              dx: d.left + d.width / 2 - (c.left + c.width / 2),
              dy: d.top + d.height / 2 - (c.top + c.height / 2),
              fill: dot ? getComputedStyle(dot).backgroundColor : null,
            }
          : null,
      };
    }),
  );
}

const cases: AuditCase[] = [];

function addCase(item: Omit<AuditCase, 'theme'> & {theme?: string}) {
  cases.push({theme: 'neutral', ...item});
}

const READY = '#storybook-root .astryx-radio-indicator';

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    addCase({
      key: `states-${mode}-${direction}`,
      group: 'states',
      story: 'core-indicator--all-states',
      ready: READY,
      mode,
      direction,
      viewport: DESKTOP,
      pointer: 'fine',
      reducedMotion: 'reduce',
      run: async (page, check, frame) => {
        const all = await radios(page);
        const unchecked = all.find(r => r.checked == null);
        const checked = all.find(r => r.checked === 'checked');
        check(unchecked != null && checked != null, 'both radio states render');
        for (const r of all) {
          check(r.hidden === 'true', `radio not hidden: ${r.hidden}`);
          check(r.radius === '50%', `radius ${r.radius}`);
        }
        check(unchecked?.dot == null, 'an unchecked radio draws a dot');
        check(checked?.dot != null, 'a checked radio draws no dot');
        check(
          unchecked != null &&
            checked != null &&
            unchecked.fill !== checked.fill,
          `checked fill ${checked?.fill} equals unchecked ${unchecked?.fill}`,
        );
        check(
          checked?.dot != null &&
            Math.abs(checked.dot.dx) <= 0.5 &&
            Math.abs(checked.dot.dy) <= 0.5,
          `dot off center ${checked?.dot?.dx},${checked?.dot?.dy}`,
        );
        const violations = await axe(page);
        check(violations.length === 0, `axe: ${violations.join(' | ')}`);
        await frame('rest', {radios: all});
      },
    });
  }
  addCase({
    key: `sizes-${mode}`,
    group: 'states',
    story: 'core-indicator--sizes',
    ready: READY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const all = await radios(page);
      const sm = all.find(r => r.size === 'sm');
      const md = all.find(r => r.size === 'md');
      check(
        sm?.width === 20 && sm.height === 20,
        `sm ${sm?.width}x${sm?.height}`,
      );
      check(
        md?.width === 24 && md.height === 24,
        `md ${md?.width}x${md?.height}`,
      );
      check(
        sm?.dot?.width === 8 && sm.dot.height === 8,
        `sm dot ${sm?.dot?.width}`,
      );
      check(
        md?.dot?.width === 10 && md.dot.height === 10,
        `md dot ${md?.dot?.width}`,
      );
      await frame('rest', {sm, md});
    },
  });
  addCase({
    key: `disabled-${mode}`,
    group: 'states',
    story: 'core-indicator--disabled',
    ready: READY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion: 'reduce',
    run: async (page, check, frame) => {
      const all = await radios(page);
      const disabled = all.filter(r => r.disabled === 'disabled');
      check(disabled.length >= 2, `disabled radios ${disabled.length}`);
      for (const r of disabled) {
        check(r.opacity === '0.5', `disabled opacity ${r.opacity}`);
      }
      await frame('rest', {radios: all});
    },
  });
}

addCase({
  key: 'states-matcha-light',
  group: 'states',
  story: 'core-indicator--all-states',
  ready: READY,
  mode: 'light',
  theme: 'matcha',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const all = await radios(page);
    const unchecked = all.find(r => r.checked == null);
    const checked = all.find(r => r.checked === 'checked');
    check(unchecked != null && checked != null, 'both themed radio states');
    for (const r of all) {
      check(r.radius === '50%', `themed radius ${r.radius}`);
    }
    check(unchecked?.dot == null, 'a themed unchecked radio draws a dot');
    check(
      checked?.dot != null &&
        Math.abs(checked.dot.dx) <= 0.5 &&
        Math.abs(checked.dot.dy) <= 0.5,
      `themed dot off center ${checked?.dot?.dx},${checked?.dot?.dy}`,
    );
    check(
      unchecked != null && checked != null && unchecked.fill !== checked.fill,
      `themed checked fill ${checked?.fill} equals unchecked ${unchecked?.fill}`,
    );
    const violations = await axe(page);
    check(violations.length === 0, `axe: ${violations.join(' | ')}`);
    await frame('rest', {radios: all});
  },
});

// In a host, hovering an enabled row tints its radio; a disabled row does not.
addCase({
  key: 'host-hover',
  group: 'host',
  story: 'core-radiolist--disabled-item',
  ready: READY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    const rest = await radios(page);
    const enabledIndex = rest.findIndex(
      r => r.disabled == null && r.checked == null,
    );
    const disabledIndex = rest.findIndex(r => r.disabled === 'disabled');
    check(enabledIndex >= 0 && disabledIndex >= 0, 'enabled and disabled rows');
    // The pointer moves to the circle's center; the host row takes the
    // hover, since the circle itself is decorative.
    const pointAt = async (index: number) => {
      const radio = page
        .locator('#storybook-root .astryx-radio-indicator')
        .nth(index);
      const box = await radio.boundingBox();
      check(box != null, `radio ${index} has no box`);
      if (box == null) {
        return false;
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const hovered = await radio.evaluate(el => el.matches(':hover'));
      check(hovered, `radio ${index} is not under the pointer`);
      return hovered;
    };
    await pointAt(enabledIndex);
    await settle(page);
    const hovered = (await radios(page))[enabledIndex];
    check(
      hovered.border !== rest[enabledIndex].border,
      `hover border ${hovered.border}, rest ${rest[enabledIndex].border}`,
    );
    await frame('hover-enabled', {rest: rest[enabledIndex], hovered});
    await pointAt(disabledIndex);
    await settle(page);
    const disabledHover = (await radios(page))[disabledIndex];
    check(
      disabledHover.border === rest[disabledIndex].border &&
        disabledHover.fill === rest[disabledIndex].fill,
      `disabled hover ${disabledHover.border}/${disabledHover.fill}, rest ${rest[disabledIndex].border}/${rest[disabledIndex].fill}`,
    );
    await frame('hover-disabled', {rest: rest[disabledIndex], disabledHover});
  },
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  addCase({
    key: `motion-${reducedMotion}`,
    group: 'motion',
    story: 'core-indicator--all-states',
    ready: READY,
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    pointer: 'fine',
    reducedMotion,
    run: async (page, check, frame) => {
      const [first] = await radios(page);
      if (reducedMotion === 'reduce') {
        check(
          first?.transition === '0s',
          `reduced transition ${first?.transition}`,
        );
      } else {
        check(
          first != null && first.transition !== '0s',
          `transition ${first?.transition}`,
        );
      }
      await frame('rest', {transition: first?.transition});
    },
  });
}

// Under forced colors the checked dot still paints, unlike its circle.
addCase({
  key: 'forced-colors',
  group: 'forced',
  story: 'core-indicator--all-states',
  ready: READY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  pointer: 'fine',
  reducedMotion: 'reduce',
  run: async (page, check, frame) => {
    await page.emulateMedia({forcedColors: 'active'});
    await settle(page, false);
    const forced = await page.evaluate(
      () => matchMedia('(forced-colors: active)').matches,
    );
    check(forced, 'forced colors not active');
    const checked = (await radios(page)).find(r => r.checked === 'checked');
    check(
      checked?.dot?.fill != null &&
        checked.dot.fill !== 'rgba(0, 0, 0, 0)' &&
        checked.dot.fill !== checked.fill,
      `forced dot ${checked?.dot?.fill} on circle ${checked?.fill}`,
    );
    await frame('rest', {checked});
  },
});

test.beforeAll(async () => {
  OUTPUT = resetAuditEvidence(EVIDENCE, test.info());
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
  return item.reducedMotion === 'reduce' && item.group !== 'motion';
}

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.reducedMotion,
  });
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
    component: 'RadioIndicator',
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
